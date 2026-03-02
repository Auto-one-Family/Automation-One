# Auftrag: Logic Engine Volltest — Regelanlage, E2E-Auslosung, UX-Feinschliff

**Ziel-Repo:** auto-one
**Kontext:** Die Cross-ESP Logic Engine ist serverseitig implementiert (ConflictManager, RateLimiter, LoopDetector, modulare Condition/Action-Evaluatoren). Der Vue-Flow-basierte Frontend-Rule-Builder existiert mit Bausteine-Palette und Config-Panel. Wokwi-Simulation laeuft bereits — ESPs sind in DB, Bodenfeuchtesensor und DS18B20 liefern Daten. Aktoren sind konfiguriert aber visuell nicht verifiziert. Dieser Auftrag gibt dem Agenten vollen Zugriff um die Logic Engine E2E zu testen: Regeln anlegen, absichtlich ausloesen, alle Sicherheitssysteme pruefen, UX-Luecken finden und direkt beheben.
**Bezug:** `auftrag-chaos-engineering-mock-volltest.md` (Infrastruktur), `STATUS.md` (Backend 95%, Frontend 95%), `auftrag-bodenfeuchtesensor-implementierung.md` (Soil-Moisture-Sensor in Simulation)
**Prioritaet:** HOCH — Logic Engine ist Kern-Feature, bisher nicht systematisch E2E getestet
**Datum:** 2026-02-27 (umstrukturiert 2026-02-28, erweitert 2026-03-02)
**Branch:** `feature/logic-engine-volltest` (fuer alle Fixes)

---

## Wichtige Vorbemerkungen fuer den Agenten

### Wokwi als Testbasis — KEIN Mock-Server

Dieser Auftrag arbeitet NICHT mit dem Mock-ESP-Server (MOCK_CHAOS01). Stattdessen laueft die echte Wokwi-Simulation. Das bedeutet:
- ESPs sind bereits in der DB registriert und approved
- Sensor-Daten kommen aus dem Wokwi-Simulator (Bodenfeuchtesensor + DS18B20 konfiguriert)
- Aktor-Kommandos werden per MQTT an die Wokwi-Simulation gesendet
- Agent muss ZUERST herausfinden welche ESP-IDs, Sensor-Types und GPIO-Pins existieren (Block A)

Wenn die Wokwi-Simulation nicht laeuft: `make wokwi-run` oder `wokwi-cli run El\ Trabajante/tests/wokwi --timeout 600`

### Verifizierte System-Architektur (2026-03-02 Codebase-Analyse)

**Backend-Architektur:**
- Router: `src/api/v1/logic.py` — Prefix `/v1/logic`, Tag `logic`
- DB-Model: `CrossESPLogic` (table `cross_esp_logic`) — Feld `rule_name` (NOT `name`), `.name` Property existiert
- DB-Model: `LogicExecutionHistory` (table `logic_execution_history`) — CASCADE DELETE bei Rule-Loeschung
- Services: `LogicEngine` (Execution), `LogicService` (CRUD), `LogicScheduler` (Timer), `LogicValidator` (Validation)
- Conditions in DB gespeichert als `trigger_conditions` (JSON), API nimmt `conditions`

**4 Condition-Evaluatoren (modulare Architektur):**
| Typ | `type`-Wert | Pflichtfelder | Optionale Felder |
|-----|-------------|---------------|------------------|
| Sensor | `"sensor_threshold"` oder `"sensor"` | `esp_id`, `gpio`, `operator`, `value` | `sensor_type`, `min`/`max` (bei `between`) |
| Zeitfenster | `"time_window"` oder `"time"` | `start_hour`/`end_hour` ODER `start_time`/`end_time` | `days_of_week` (0=Mo..6=So) |
| Compound | `"compound"` | `logic` ("AND"/"OR"), `conditions` (Sub-Liste) | — |
| Hysterese | `"hysteresis"` | `esp_id`, `gpio` | `activate_above`+`deactivate_below` ODER `activate_below`+`deactivate_above`, `sensor_type` |

**4 Action-Executoren:**
| Typ | `type`-Wert | Pflichtfelder | Optionale Felder |
|-----|-------------|---------------|------------------|
| Aktor | `"actuator_command"` oder `"actuator"` | `esp_id`, `gpio`, `command` (ON/OFF/PWM/TOGGLE) | `value` (0.0-1.0), `duration_seconds`/`duration` |
| Notification | `"notification"` | `channel` (websocket/email/webhook) | `target`, `message_template` (Variablen: `{sensor_value}`, `{esp_id}`, `{gpio}`, `{sensor_type}`, `{timestamp}`, `{rule_name}`, `{rule_id}`) |
| Delay | `"delay"` | `seconds` (1-3600) | — |
| Sequence | `"sequence"` | `steps` (Liste) | `sequence_id`, `description`, `abort_on_failure`, `max_duration_seconds` |

**Safety-Systeme:**
- ConflictManager: Lock-TTL 60s, Priority-basiert (niedrigere Zahl = hoehere Prio), `SAFETY_PRIORITY = -1000`
- RateLimiter: 3-Tier Token-Bucket — Global 100/s, Per-ESP 20/s, Per-Rule hourly (aus `max_executions_per_hour`)
- LoopDetector: Statische Zykluserkennung bei Create/Update, MAX_CHAIN_DEPTH=10

**API-Endpunkte (verifiziert):**
| Method | Pfad | Auth | Beschreibung |
|--------|------|------|-------------|
| GET | `/v1/logic/rules` | ActiveUser | Liste (paginiert: `page`, `page_size`, `enabled`) |
| GET | `/v1/logic/rules/{id}` | ActiveUser | Einzelne Regel |
| POST | `/v1/logic/rules` | OperatorUser | Erstellen |
| PUT | `/v1/logic/rules/{id}` | OperatorUser | Aktualisieren (alle Felder optional) |
| DELETE | `/v1/logic/rules/{id}` | OperatorUser | Loeschen (CASCADE: Execution-History auch weg!) |
| POST | `/v1/logic/rules/{id}/toggle` | OperatorUser | Enable/Disable (`{enabled: bool, reason?: str}`) |
| POST | `/v1/logic/rules/{id}/test` | OperatorUser | Dry-Run Test (`{mock_sensor_values?, mock_time?, dry_run?}`) |
| GET | `/v1/logic/execution_history` | ActiveUser | History (Filter: `rule_id`, `success`, `start_time`, `end_time`, `limit`) |
| GET | `/v1/sequences` | ActiveUser | Laufende Sequences |
| GET | `/v1/sequences/stats` | ActiveUser | Sequence-Statistiken |
| POST | `/v1/sequences/{id}/cancel` | OperatorUser | Sequence abbrechen |

**Frontend-Architektur:**
- Route: `/logic` (Name: `logic`) und `/logic/:ruleId` (Name: `logic-rule`, Deep-Link)
- Components in `src/components/rules/`: `RuleFlowEditor`, `RuleNodePalette`, `RuleConfigPanel`, `RuleCard`, `RuleTemplateCard`
- Store: `logic.store.ts` (ID: `logic`) — fetchRules, createRule, updateRule, deleteRule, toggleRule, testRule
- API-Client: `src/api/logic.ts` — `logicApi.getRules()`, `.createRule()`, `.updateRule()`, etc.
- ESP-Daten: `espStore.devices` (vorgeladen) mit `.sensors[]` und `.actuators[]` pro Geraet
- WebSocket: Subscribed auf `logic_execution` Events → Flash-Animation auf RuleCard + Nodes
- Undo/Redo: Ctrl+Z / Ctrl+Y, max 50 Snapshots
- 6 Templates: Temperatur-Alarm, Bewaesserungs-Zeitplan, Luftfeuchte-Regelung, Nacht-Modus, pH-Alarm, Notfall-Abschaltung

**MQTT-Trigger-Kette (verifiziert):**
```
ESP → MQTT sensor data → sensor_handler.process_message()
  → Speichert in sensor_data Tabelle
  → asyncio.create_task(trigger_logic_evaluation())
    → LogicEngine.evaluate_sensor_data(esp_id, gpio, sensor_type, value)
      → get_rules_by_trigger_sensor() (JSON-Filter auf trigger_conditions)
      → Fuer jede passende Regel:
         1. Cooldown-Check (last_triggered + cooldown_seconds > now → skip)
         2. RateLimiter.check_rate_limit() (3 Tiers)
         3. Cross-Sensor-Werte laden (DB-Lookup fuer andere Sensoren in Conditions)
         4. Conditions evaluieren (modular via Evaluatoren)
         5. ConflictManager.acquire_actuator() (Lock pro esp_id:gpio)
         6. Actions ausfuehren (via Executoren)
         7. WS broadcast "logic_execution" Event
         8. DB: log_execution() in logic_execution_history
         9. rule.last_triggered = now
```

### Sensor-Daten fuer Logic-Trigger simulieren

Um Logic-Regeln absichtlich auszuloesen, muss der Agent Sensor-Werte an bestimmte Schwellwerte bringen. Dafuer stehen zwei Wege zur Verfuegung:

**Weg 1 — MQTT-Inject (bevorzugt, sofort):**
```bash
# Direkt einen Sensor-Messwert einspeisen der einen Schwellwert ueberschreitet
# Korrekte Topics (aus Trockentest 2026-02-25 verifiziert):
# kaiser/{zone}/esp/{esp_id}/sensor/{gpio}/data

docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/{ZONE}/esp/{ESP_ID}/sensor/{GPIO}/data" \
  -m '{"ts":TIMESTAMP,"esp_id":"{ESP_ID}","gpio":GPIO,"sensor_type":"ds18b20","raw":2800,"raw_mode":false,"value":28.0,"unit":"C","quality":"good"}'
```

**Weg 2 — Wokwi-Parameter aendern (wenn verfuegbar):**
Wokwi-MCP-Server kann Simulation steuern: `wokwi-cli mcp` startet MCP-Server.
Nur nutzen wenn MQTT-Inject nicht ausreicht.

### MQTT Topics (verifiziert 2026-02-25)

```
Heartbeat:     kaiser/{zone}/esp/{esp_id}/system/heartbeat
Sensor-Data:   kaiser/{zone}/esp/{esp_id}/sensor/{gpio}/data
Config-Resp:   kaiser/{zone}/esp/{esp_id}/config_response
LWT:           kaiser/{zone}/esp/{esp_id}/system/lwt
Commands:      kaiser/{zone}/esp/{esp_id}/actuator/{id}/command
Logic-Events:  (WebSocket) logic_execution Event auf WS /ws
```

### Payload-Formate (verifiziert)

```json
// Sensor-Data (Single-Value DS18B20):
{"ts": 1740000000, "esp_id": "ESP_WOKWI01", "gpio": 4, "sensor_type": "ds18b20",
 "raw": 2800, "raw_mode": false, "value": 28.0, "unit": "C", "quality": "good"}

// Sensor-Data (Bodenfeuchte analog):
{"ts": 1740000000, "esp_id": "ESP_WOKWI01", "gpio": 34, "sensor_type": "soil_moisture",
 "raw": 1800, "raw_mode": true, "value": 45.0, "unit": "%", "quality": "good"}

// Actuator-Command (was der Server senden soll):
{"command": "on", "duration": null, "value": null}
{"command": "off", "duration": null, "value": null}
{"command": "pwm", "duration": null, "value": 75}
```

### Logic-Rule Create Schema (verifiziert aus Codebase)

```json
{
  "name": "Regel-Name",
  "description": "Optionale Beschreibung",
  "enabled": true,
  "logic_operator": "AND",
  "priority": 100,
  "cooldown_seconds": 60,
  "max_executions_per_hour": 10,
  "conditions": [
    {
      "type": "sensor",
      "esp_id": "ESP_WOKWI01",
      "gpio": 4,
      "sensor_type": "DS18B20",
      "operator": ">",
      "value": 25.0
    }
  ],
  "actions": [
    {
      "type": "actuator",
      "esp_id": "ESP_WOKWI01",
      "gpio": 5,
      "command": "ON",
      "value": 1.0,
      "duration": 0
    }
  ]
}
```

**WICHTIG — Condition `type` akzeptiert sowohl `"sensor_threshold"` als auch `"sensor"`!**
**WICHTIG — Action `type` akzeptiert sowohl `"actuator_command"` als auch `"actuator"`!**
**WICHTIG — Frontend-Palette nutzt `moisture` (nicht `soil_moisture`) als Default fuer Bodenfeuchte-Nodes!**
**WICHTIG — Neue Regeln werden im Frontend mit `enabled: false` erstellt!**

### WebSocket Events bei Logic-Ausfuehrung

```json
// Event-Typ: "logic_execution"
{
  "rule_id": "uuid",
  "rule_name": "Regel-Name",
  "trigger": {"esp_id": "...", "gpio": 4, "sensor_type": "ds18b20", "value": 28.0, "timestamp": 1740000000},
  "action": {"esp_id": "...", "gpio": 5, "command": "ON"},
  "success": true,
  "message": "...",
  "timestamp": 1740000000
}

// Sequence-Events (bei Sequence-Actions):
// "sequence_started", "sequence_step", "sequence_completed", "sequence_error", "sequence_cancelled"
```

### Auth-Flow

```bash
TOKEN=$(curl -sf -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "admin", "password": "Admin123#"}' | jq -r '.tokens.access_token')
echo "Token: ${TOKEN:0:20}..."
```

### Playwright MCP Server — Frontend-Interaktionen

```json
// .mcp.json Eintrag pruefen (falls nicht vorhanden: hinzufuegen):
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

| Tool | Wann nutzen |
|------|-------------|
| `browser_navigate` | Rule-Builder URL aufrufen |
| `browser_snapshot` | Accessibility-Tree fuer Element-Refs |
| `browser_click` | Nodes droppen, Buttons klicken |
| `browser_drag` | Node von Palette auf Canvas ziehen |
| `browser_type` | Schwellwert-Input, Regel-Name |
| `browser_select_option` | ESP-Dropdown, Operator-Dropdown |
| `browser_screenshot` | Visuellen Zustand dokumentieren |
| `browser_console_messages` | JS-Errors checken |
| `browser_network_requests` | 4xx/5xx Requests finden |
| `browser_wait` | Nach WebSocket-Events warten |
| `browser_resize` | Responsive-Tests |

**Dual-Verifikation nach jedem Klick:**
1. `browser_console_messages` — keine JS-Errors?
2. `browser_network_requests` — keine 4xx/5xx?

Falls 500er: sofort Server-Logs pruefen:
```bash
docker logs automationone-server 2>&1 | tail -30
```

### Server-Log-Korrelation im Hintergrund

```bash
# Waehrend Playwright-Tests: Logs live mitlesen
docker logs -f automationone-server 2>&1 | grep -E "ERROR|WARN|logic|rule|actuator|Exception|Traceback" &
LOG_PID=$!

# Nach Test-Block:
kill $LOG_PID
```

### KI-Rollentrennung

Dieser Auftrag nutzt Rolle 1 (Executor — System testen) + Rolle 3 (Fixer — direkte Fixes). Agenten-Delegation:
- `/autoops:ops` — Orchestrierung, Block A+D+G (Server-seitig)
- `frontend-development` — Block C+F (Playwright + UX-Fixes)
- `server-development` — Block D (API-Analyse) + Backend-Fixes bei Logic-Bugs

Groessere Probleme → Sub-Auftrag dokumentieren, NICHT sofort in diesem Branch loesen. Alle Fixes committen auf `feature/logic-engine-volltest`.

### Fix-as-you-go Protokoll (PFLICHT)

Bei **jedem** Problem das waehrend der Ausfuehrung auftritt:

```
1. ERKENNEN  → Was genau ist das Problem? (Fehler-Output dokumentieren)
2. ISOLIEREN → In welcher Schicht liegt es? (Backend/Firmware/Frontend)
3. ROOT CAUSE → Warum passiert es? (Code lesen, Logs pruefen)
4. FIX       → Minimaler, gezielter Fix (kein Over-Engineering)
5. VERIFIZIEREN → Fix funktioniert? (gleichen Test nochmal ausfuehren)
6. COMMIT    → `git add <geaenderte-dateien> && git commit -m "fix(<scope>): <was>"`
7. WEITER    → Naechsten Schritt im aktuellen Block fortsetzen
```

**Regeln:**
- KEINE Workarounds. Richtigen Fix machen oder Sub-Auftrag schreiben
- Jeden Fix einzeln committen (nicht sammeln)
- Fix-Commit-Message-Format: `fix(logic|frontend|firmware): kurze beschreibung`
- Bei Fixes die > 30min dauern wuerden: als BUG dokumentieren, Sub-Auftrag anlegen, WEITER
- Alle Fixes werden im Report (Block H) aufgelistet

---

## Ist-Zustand

| Komponente | Stand | Testlauf-Readiness |
|------------|-------|-------------------|
| Logic Engine Backend | Implementiert | ConflictManager, RateLimiter, LoopDetector, Conditions, Actions |
| Logic Rule Builder Frontend | Implementiert | Vue Flow, Bausteine-Palette, Config-Panel |
| Wokwi-Simulation | Laeuft | ESPs in DB, Bodenfeuchtesensor + DS18B20 kommen rein |
| Aktoren Wokwi | Unklar | System sagt "konfiguriert", visuell nicht verifiziert |
| ESP-Auswahl im Rule-Builder | Unbekannt | Dropdown vorhanden, Funktion nicht verifiziert |
| Sensor-Auswahl im Rule-Builder | Unbekannt | Zone-basiert oder ESP-spezifisch? |
| AND/OR-Logik | Implementiert | Design gefaellt Robin, soll ausgebaut werden |
| UX-Feinschliff | Ausstehend | Schriftgroessen, Positionierungen, dynamisches Layout |
| Error- + Sicherheitsfunktionen | Implementiert | Nicht an allen Punkten verifiziert |

**Bekannte Voraussetzungen:**
- Docker-Stack laeuft: `docker compose --profile monitoring up -d`
- Wokwi-Simulation laeuft mit konfigurierten Sensoren
- Branch `feature/logic-engine-volltest` existiert oder wird erstellt

---

## Uebersicht der Bloecke (ERWEITERT 2026-03-02)

| Block | Thema | Prioritaet | Aufwand | Abhaengigkeit |
|-------|-------|------------|---------|---------------|
| **A** | Wokwi-Wiring-Check + Variablen setzen | KRITISCH | 30min | Keine |
| **D** | Logic Rules anlegen + ausfuehren (KERN!) | KRITISCH — HAUPTFOKUS | 5-6h | A |
| **G** | Aktor-Verifikation + Wokwi-Feedback-Loop | HOCH | 1.5h | A + D |
| **E** | Error-Handling + Edge Cases | HOCH | 2h | D |
| **C** | Frontend Rule Builder Deep-Dive (Playwright) | HOCH | 3-4h | D + G |
| **P** | Persistenz, Navigation, Loeschen, Wiederherstellen | HOCH | 2h | C + D |
| **F** | UX-Feinschliff + Layout-Korrektur | OPTIONAL | 2-3h | C |
| **H** | Report + Fix-Dokumentation | PFLICHT | 30min | Alle |

**REIHENFOLGE:** A → D (KERN!) → G → E → C → P → F (optional) → H

**Gesamt-Aufwand:** 14-18 Stunden (2-3 Sessions)

**Aenderungen gegenueber v1 (2026-02-28):**
- Block D: Neue Szenarien D8-D14 (Hysterese, Zeitfenster, Compound, Sequence, Test-Endpoint, Toggle, Cross-ESP)
- Block C: Komplett neu geschrieben mit praezisen Playwright-Schritten basierend auf Codebase-Analyse
- Block P: NEU — Persistenz-Tests, Navigation, Loeschen+Rueckgaengig, Route-Verifikation
- Block E: Erweitert um Timer-Regel-Tests und Scheduler-Verifikation
- API-Schema korrigiert: `"sensor"` statt nur `"sensor_threshold"`, `"actuator"` statt nur `"actuator_command"`
- Neue Condition-Typen: `hysteresis`, `time_window`, `compound`
- Neue Action-Typen: `sequence`, `notification` (verifiziert)

**Designprinzip:** Bloecke B (API-Analyse) und C (Frontend-Deep-Dive) aus der Originalplanung sind IN Block D integriert bzw. nach hinten verschoben. Grund: API-Schema entdeckt man am schnellsten durch das Anlegen der ersten Regel. Frontend-UX prueft man erst wenn die Rules serverseitig funktionieren.

---

## Block A: Wokwi-Wiring-Check + Variablen setzen

**Ziel:** In 30 Minuten sicherstellen dass die Wokwi-Simulation korrekt verkabelt ist, alle Daten fliessen, und die Shell-Variablen fuer Block D stehen. KEIN tiefes Inventar — nur das Minimum fuer den Rule-Test.

### A1 — Stack-Check + Auth (5min)

```bash
# Stack laeuft?
curl -sf http://localhost:8000/health | jq '{status: .status, db: .database, mqtt: .mqtt}'

# Token holen
TOKEN=$(curl -sf -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "admin", "password": "Admin123#"}' | jq -r '.tokens.access_token')
echo "Auth OK: ${TOKEN:0:20}..."

# Container healthy?
docker ps --format "table {{.Names}}\t{{.Status}}" | grep automationone
```

**Go/No-Go:** Wenn `/health` nicht 200 oder Token leer → Stack starten, nicht weitermachen.

### A2 — Wokwi-Diagramm Wiring-Check (10min)

**KRITISCH: Pruefen ob die GPIO-Pins im Wokwi-Diagramm mit den Sensor-Configs in der DB uebereinstimmen.**

```bash
# Wokwi-Diagramm finden und lesen
find . -path "*/wokwi*" -name "diagram*.json" | head -5

# Diagramm analysieren: Welche Teile, welche Pins
cat "El Trabajante/tests/wokwi/diagram.json" 2>/dev/null | \
  jq '[.parts[] | {type: .type, id: .id, attrs: .attrs}]' 2>/dev/null

# Verbindungen (Wiring) pruefen
cat "El Trabajante/tests/wokwi/diagram.json" 2>/dev/null | \
  jq '[.connections[] | {from: .from, to: .to}]' 2>/dev/null

# CHECKLISTE fuer Wiring:
# - DS18B20: Data-Pin an welchem GPIO? Pull-Up-Widerstand (4.7kΩ) vorhanden?
# - Bodenfeuchtesensor (DFRobot SEN0193): Signal an welchem ADC-GPIO? (muss ADC1 sein: 32-39)
# - Aktor (LED/Relay): An welchem GPIO?
# - I2C-Sensoren (falls SHT31): SDA + SCL an welchen GPIOs?
```

```bash
# DB-Sensor-Configs mit Wokwi-Wiring abgleichen
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT sc.esp_id, sc.sensor_type, sc.gpio, sc.interface_type, sc.i2c_address
   FROM sensor_configs sc
   JOIN esps e ON sc.esp_id = e.esp_id
   WHERE e.status = 'online' OR e.last_seen > NOW() - INTERVAL '30 minutes'
   ORDER BY sc.esp_id, sc.gpio;"

# VERGLEICH: GPIO im Diagramm == GPIO in sensor_configs?
# Falls MISMATCH: FIX! Entweder Diagramm oder DB-Config anpassen.
```

### A3 — ESP/Sensor/Aktor-Variablen setzen (15min)

```bash
# Aktive Wokwi-ESPs ermitteln
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -t -c \
  "SELECT esp_id FROM esps
   WHERE is_approved = true
   AND (last_seen > NOW() - INTERVAL '30 minutes' OR status = 'online')
   ORDER BY last_seen DESC LIMIT 1;" | tr -d ' '

# Variablen setzen (aus Query-Ergebnissen):
export ESP_ID="ESP_WOKWI01"   # ← aus Query oben
export ZONE="god"              # ← aus esps.zone_id
export SENSOR_GPIO_TEMP=4      # ← DS18B20 GPIO aus Wiring-Check
export SENSOR_GPIO_SOIL=34     # ← Bodenfeuchtesensor GPIO aus Wiring-Check

# Aktor ermitteln
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/actuators | jq '[.[] | {id, esp_id, name, actuator_type, gpio}]'
export AKTOR_ID="HIER_EINTRAGEN"  # ← aus Aktor-Query

# Sensor-Daten-Fluss pruefen (die letzten 5 Minuten)
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT sensor_type, esp_id, COUNT(*) as readings,
          ROUND(AVG(value)::numeric, 2) as avg_val,
          MAX(timestamp) as last_reading
   FROM sensor_data
   WHERE timestamp > NOW() - INTERVAL '5 minutes'
   GROUP BY sensor_type, esp_id
   ORDER BY last_reading DESC;"

# Naming-Check: soil_moisture oder moisture?
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -t -c \
  "SELECT DISTINCT sensor_type FROM sensor_data
   WHERE sensor_type IN ('soil_moisture', 'moisture')
   AND timestamp > NOW() - INTERVAL '30 minutes';"
```

### A — Go/No-Go Checkliste

- [ ] Stack-Health: `/health` = 200, Token gesetzt
- [ ] Wokwi-Diagramm: GPIO-Pins gelesen und mit DB-Configs abgeglichen
- [ ] **KEIN GPIO-MISMATCH** zwischen Diagramm und sensor_configs
- [ ] Sensor-Daten fliessen: Mindestens 1 Sensortyp hat Readings < 5min
- [ ] Variablen gesetzt: `$TOKEN`, `$ESP_ID`, `$ZONE`, `$SENSOR_GPIO_TEMP`, `$SENSOR_GPIO_SOIL`, `$AKTOR_ID`
- [ ] Sensor-Type-Name geklaert: `soil_moisture` oder `moisture`

**Falls Daten NICHT fliessen:** Wokwi-Simulation pruefen (`make wokwi-run`), MQTT-Broker subscriben (`docker exec automationone-mqtt mosquitto_sub -h localhost -p 1883 -t "kaiser/#" -v -C 5 -W 30`).

**Zeitschaetzung Block A:** 30 Minuten

---

## Block D: Logic Rules anlegen + ausfuehren — HAUPTFOKUS

**KERN-BLOCK — Hier passiert das Wesentliche.** Agent entdeckt das API-Schema, legt echte aktive Regeln an und triggert sie mit MQTT-injizierten Sensor-Werten. Jede Regel wird verifiziert: MQTT-Command gesendet? WebSocket-Event gefeuert? Aktor-Status aktualisiert?

**Voraussetzung:** Alle Variablen aus Block A gesetzt.

### D0 — API-Schema entdecken + Monitoring starten

**Ziel:** Das exakte Logic-API-Schema ermitteln durch OpenAPI + erste Test-Regel. Gleichzeitig Monitoring starten fuer alle folgenden Tests.

```bash
# Logic Endpoints aus OpenAPI ermitteln
curl -sf http://localhost:8000/openapi.json | \
  jq '[.paths | to_entries[] | select(.key | contains("logic")) | {path: .key, methods: (.value | keys)}]'

# Request/Response-Schema fuer Rule-Erstellung
curl -sf http://localhost:8000/openapi.json | \
  jq '.components.schemas | to_entries[] | select(.key | test("Rule|Logic|Condition|Action"; "i")) | {name: .key, properties: .value.properties}' 2>/dev/null | head -80

# Bestehende Regeln pruefen
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/logic/rules | jq 'if type == "array" then {count: length, rules: [.[] | {id, name, enabled}]} else . end'

# Logic-relevante DB-Tabellen
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_name LIKE '%logic%' OR table_name LIKE '%rule%'
   ORDER BY table_name;"
```

```bash
# Monitoring starten (laeuft im Hintergrund waehrend aller D-Szenarien)

# MQTT-Actuator-Commands beobachten
docker exec automationone-mqtt mosquitto_sub \
  -h localhost -p 1883 \
  -t "kaiser/+/esp/+/actuator/+/command" \
  -v 2>/dev/null &
MQTT_CMD_PID=$!

# Server-Logs fuer Logic-Events
docker logs -f automationone-server 2>&1 | grep -E "logic|rule|trigger|actuator|ERROR" &
LOG_PID=$!

echo "Monitoring gestartet (MQTT: $MQTT_CMD_PID, LOG: $LOG_PID)"
```

```bash
# Schema-Probe: Minimale Testregel anlegen (disabled)
PROBE=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d '{
    "name": "D0_Schema_Probe_DELETE_ME",
    "description": "Schema-Test — wird sofort geloescht",
    "enabled": false,
    "conditions": [],
    "actions": [],
    "logic_operator": "AND"
  }')
echo "Schema-Probe Response:"
echo "$PROBE" | jq .

# → Hieraus lernen: Welche Felder akzeptiert die API?
# → Welche ID-Struktur (UUID, int, string)?
# → Welches Response-Format?
PROBE_ID=$(echo $PROBE | jq -r '.id // .rule_id // .data.id')

# CRUD-Kurztest
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/rules/${PROBE_ID}" | jq .

curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/rules/${PROBE_ID}"
echo "Schema-Probe geloescht"
```

**Ergebnis D0:** Exaktes API-Schema dokumentiert. Monitoring laeuft. Bereit fuer erste echte Regel.

### D1 — Szenario 1: Einfache Schwellwert-Regel (Temperatur → Aktor)

**Regel:** DS18B20 Temperatur > 25°C → Aktor EIN

**Das ist der wichtigste Test. Wenn D1 funktioniert, funktioniert der Kern der Logic Engine.**

```bash
# Schritt 1: Regel anlegen
RULE_D1=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D1_Temp_Schwellwert\",
    \"description\": \"Wenn Temp > 25C dann Aktor EIN\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [{
      \"type\": \"sensor_threshold\",
      \"sensor_type\": \"ds18b20\",
      \"esp_id\": \"${ESP_ID}\",
      \"operator\": \">\",
      \"value\": 25.0
    }],
    \"actions\": [{
      \"type\": \"actuator_command\",
      \"actuator_id\": \"${AKTOR_ID}\",
      \"command\": \"on\"
    }]
  }")
RULE_D1_ID=$(echo $RULE_D1 | jq -r '.id // .rule_id')
echo "Regel D1 angelegt: $RULE_D1_ID"
echo "$RULE_D1" | jq .
```

**Falls Fehler hier → Fix-as-you-go Protokoll! Typische Ursachen:**
- Falsches Condition-Schema (Feld-Namen aus D0 korrigieren)
- ESP_ID nicht in DB / nicht approved
- Aktor-ID nicht existent
- Sensor-Type-Name falsch (`soil_moisture` vs `moisture`)

```bash
# Schritt 2: Normaler Wert (22°C) → Aktor soll NICHT schalten
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2200,\"raw_mode\":false,\"value\":22.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "Test 22°C gesendet — Aktor sollte NICHT schalten"

# Schritt 3: Schwellwert ueberschreiten (28°C) → Aktor MUSS schalten
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2800,\"raw_mode\":false,\"value\":28.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 5
echo "Test 28°C gesendet — Aktor MUSS schalten (MQTT-Command + WS-Event erwartet)"

# Schritt 4: Wieder unter Schwellwert (22°C) → Auto-Off-Verhalten pruefen
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2200,\"raw_mode\":false,\"value\":22.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "Test 22°C gesendet — Auto-Off-Verhalten pruefen"
```

**Verifikation D1:**
```bash
# MQTT-Command-Log pruefen (Monitoring laeuft seit D0)
# → Erwartet: actuator command "on" sichtbar nach 28°C

# Aktor-Status nach Trigger
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/actuators/${AKTOR_ID}" | jq '{id, status, last_command}'

# Logic-Execution in DB?
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%execut%' OR table_name LIKE '%logic%';"

# Server-Log: Logic-Evaluation sichtbar?
docker logs automationone-server 2>&1 | grep -i "logic\|rule\|evaluation\|trigger" | tail -20
```

**D1 ist der GATE-KEEPER. Wenn D1 nicht funktioniert → Root Cause finden und fixen bevor D2 beginnt.**

### D2 — Szenario 2: AND-Logik (Temperatur UND Bodenfeuchte)

**Regel:** DS18B20 > 25°C UND Bodenfeuchte < 40% → Aktor EIN

```bash
# Sensor-Type-Name fuer Bodenfeuchte aus Block A verwenden!
# SOIL_TYPE = "soil_moisture" oder "moisture" (aus A3 geklaert)
SOIL_TYPE="soil_moisture"  # ← anpassen!

RULE_D2=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D2_AND_Temp_UND_Feuchte\",
    \"description\": \"Beide Bedingungen noetig: heiss UND trocken\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [
      {
        \"type\": \"sensor_threshold\",
        \"sensor_type\": \"ds18b20\",
        \"esp_id\": \"${ESP_ID}\",
        \"operator\": \">\",
        \"value\": 25.0
      },
      {
        \"type\": \"sensor_threshold\",
        \"sensor_type\": \"${SOIL_TYPE}\",
        \"esp_id\": \"${ESP_ID}\",
        \"operator\": \"<\",
        \"value\": 40.0
      }
    ],
    \"actions\": [{
      \"type\": \"actuator_command\",
      \"actuator_id\": \"${AKTOR_ID}\",
      \"command\": \"on\"
    }]
  }")
RULE_D2_ID=$(echo $RULE_D2 | jq -r '.id // .rule_id')
echo "Regel D2 angelegt: $RULE_D2_ID"
```

```bash
# Test 2a: Nur Temperatur hoch, Feuchte OK → NICHT schalten
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2800,\"raw_mode\":false,\"value\":28.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 2

docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_SOIL}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_SOIL},\"sensor_type\":\"${SOIL_TYPE}\",\"raw\":2000,\"raw_mode\":false,\"value\":60.0,\"unit\":\"%\",\"quality\":\"good\"}"
sleep 3
echo "Test 2a: Nur Temp hoch (Feuchte 60% OK) — kein Schalten erwartet"

# Test 2b: Nur Feuchte niedrig, Temp OK → NICHT schalten
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2200,\"raw_mode\":false,\"value\":22.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 2

docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_SOIL}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_SOIL},\"sensor_type\":\"${SOIL_TYPE}\",\"raw\":1000,\"raw_mode\":false,\"value\":25.0,\"unit\":\"%\",\"quality\":\"good\"}"
sleep 3
echo "Test 2b: Nur Feuchte niedrig (Temp 22° OK) — kein Schalten erwartet"

# Test 2c: BEIDE Bedingungen erfuellt → MUSS schalten
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2800,\"raw_mode\":false,\"value\":28.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 2

docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_SOIL}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_SOIL},\"sensor_type\":\"${SOIL_TYPE}\",\"raw\":1000,\"raw_mode\":false,\"value\":25.0,\"unit\":\"%\",\"quality\":\"good\"}"
sleep 5
echo "Test 2c: BEIDE Bedingungen — MUSS schalten (MQTT-Command erwartet)"
```

### D3 — Szenario 3: OR-Logik

**Regel:** Bodenfeuchte < 30% ODER Temperatur > 30°C → Warnung/Notification

```bash
RULE_D3=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D3_OR_Feuchte_ODER_Hitze\",
    \"description\": \"Einer reicht aus\",
    \"enabled\": true,
    \"logic_operator\": \"OR\",
    \"conditions\": [
      {\"type\": \"sensor_threshold\", \"sensor_type\": \"${SOIL_TYPE}\", \"esp_id\": \"${ESP_ID}\", \"operator\": \"<\", \"value\": 30.0},
      {\"type\": \"sensor_threshold\", \"sensor_type\": \"ds18b20\", \"esp_id\": \"${ESP_ID}\", \"operator\": \">\", \"value\": 30.0}
    ],
    \"actions\": [{
      \"type\": \"notification\",
      \"message\": \"WARNUNG: Feuchte oder Hitze kritisch\"
    }]
  }")
RULE_D3_ID=$(echo $RULE_D3 | jq -r '.id // .rule_id')
echo "Regel D3 (OR): $RULE_D3_ID"

# Test: Nur Feuchte niedrig → Soll feuern (OR = einer reicht)
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_SOIL}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_SOIL},\"sensor_type\":\"${SOIL_TYPE}\",\"raw\":800,\"raw_mode\":false,\"value\":20.0,\"unit\":\"%\",\"quality\":\"good\"}"
sleep 5
echo "Test 3: Feuchte 20% — OR sollte feuern"

# Falls Notification Action-Typ nicht existiert:
# → Server-Logs pruefen, ggf. durch actuator_command ersetzen
docker logs automationone-server 2>&1 | grep -i "notification\|action.*type\|unsupported" | tail -5
```

### D4 — Szenario 4: Mehrere aktive Regeln gleichzeitig

**Ziel:** Pruefen ob mehrere Regeln parallel evaluiert werden wenn ein Sensor-Wert reinkommt.

```bash
# 3 Regeln gleichzeitig aktiv: D1 (Temp>25), D2 (AND), D3 (OR)
# Alle drei anschauen
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/logic/rules | jq '[.[] | {id, name, enabled}]'

# Einen Wert senden der ALLE drei triggern sollte:
# Temp 32°C (> 25 fuer D1, > 30 fuer D3) + Feuchte 20% (< 40 fuer D2, < 30 fuer D3)
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":3200,\"raw_mode\":false,\"value\":32.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 2

docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_SOIL}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_SOIL},\"sensor_type\":\"${SOIL_TYPE}\",\"raw\":600,\"raw_mode\":false,\"value\":20.0,\"unit\":\"%\",\"quality\":\"good\"}"
sleep 5

echo "Multi-Regel-Test: D1 + D2 + D3 sollten alle feuern"
docker logs automationone-server 2>&1 | grep -i "logic\|rule\|evaluation\|execution" | tail -30
```

### D5 — Szenario 5: Verzoegerung + Cooldown

```bash
# Regel mit Verzoegerung (falls "delay" Action-Typ existiert)
RULE_D5=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D5_Delay_Cooldown\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [{
      \"type\": \"sensor_threshold\",
      \"sensor_type\": \"ds18b20\",
      \"esp_id\": \"${ESP_ID}\",
      \"operator\": \">\",
      \"value\": 26.0
    }],
    \"actions\": [
      {\"type\": \"delay\", \"seconds\": 10},
      {\"type\": \"actuator_command\", \"actuator_id\": \"${AKTOR_ID}\", \"command\": \"on\"}
    ],
    \"cooldown_seconds\": 30
  }")
RULE_D5_ID=$(echo $RULE_D5 | jq -r '.id // .rule_id')

# Falls "delay" Action nicht unterstuetzt → dokumentieren und weiter
if echo "$RULE_D5" | jq -e '.error // .detail' > /dev/null 2>&1; then
  echo "HINWEIS: delay Action-Typ nicht unterstuetzt — dokumentiert, weiter mit D6"
else
  # Trigger
  START_TS=$(date +%s)
  docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
    -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
    -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2700,\"raw_mode\":false,\"value\":27.0,\"unit\":\"C\",\"quality\":\"good\"}"
  echo "Trigger gesendet — warte 15s auf verzogerte Aktion..."
  sleep 15
  echo "Aktion sollte nach ~10s eingetroffen sein"

  # Cooldown-Test: Sofort nochmal triggern
  docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
    -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
    -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2700,\"raw_mode\":false,\"value\":27.0,\"unit\":\"C\",\"quality\":\"good\"}"
  sleep 3
  echo "Cooldown-Test: Zweiter Trigger — sollte NICHT sofort feuern (30s Cooldown)"
fi
```

### D6 — Szenario 6: Safety-System (ConflictManager + RateLimiter)

```bash
# Test 6a: ConflictManager — zwei Regeln steuern gleichen Aktor widersprüchlich
RULE_CONFLICT=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D6_KONFLIKT_Regel\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [{
      \"type\": \"sensor_threshold\",
      \"sensor_type\": \"ds18b20\",
      \"esp_id\": \"${ESP_ID}\",
      \"operator\": \">\",
      \"value\": 20.0
    }],
    \"actions\": [{
      \"type\": \"actuator_command\",
      \"actuator_id\": \"${AKTOR_ID}\",
      \"command\": \"off\"
    }]
  }")

# Beide Regeln triggern: D1 sagt ON (>25), D6 sagt OFF (>20)
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2800,\"raw_mode\":false,\"value\":28.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 5
echo "Konflikt-Test: D1 (ON) vs D6 (OFF) — was gewinnt?"
docker logs automationone-server 2>&1 | grep -i "conflict\|ConflictManager" | tail -10

# Test 6b: RateLimiter — 10 Trigger in 5 Sekunden
echo "RateLimiter-Test: 10 Trigger in 5 Sekunden"
for i in $(seq 1 10); do
  docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
    -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
    -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2900,\"raw_mode\":false,\"value\":29.0,\"unit\":\"C\",\"quality\":\"good\"}"
  sleep 0.5
done
sleep 3
echo "RateLimiter-Ergebnis:"
docker logs automationone-server 2>&1 | grep -i "rate_limit\|RateLimiter\|throttle" | tail -10

# Konflikt-Regel loeschen
CONFLICT_ID=$(echo $RULE_CONFLICT | jq -r '.id // .rule_id')
curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/rules/${CONFLICT_ID}"
```

### D7 — Regeln aufraemen (Zwischenstand)

```bash
# D2, D3, D5, D6-Konflikt loeschen. D1 behalten fuer spaetere Blocks.
for RULE_ID in $RULE_D2_ID $RULE_D3_ID $RULE_D5_ID; do
  if [ -n "$RULE_ID" ] && [ "$RULE_ID" != "null" ]; then
    curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
      "http://localhost:8000/api/v1/logic/rules/${RULE_ID}" > /dev/null
    echo "Regel $RULE_ID geloescht"
  fi
done
echo "Regel D1 ($RULE_D1_ID) behalten fuer weitere Tests"
```

### D8 — Szenario 8: Hysterese-Condition (Flapping-Schutz)

**Ziel:** Hysterese verhindert dass ein Aktor bei Schwellwert-Grenze staendig ein/aus schaltet.
Die HysteresisConditionEvaluator hat In-Memory-State (`{rule_id}:{condition_index}`).

```bash
# Hysterese-Regel: Kuehlung aktivieren bei >28°C, deaktivieren bei <24°C
RULE_D8=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D8_Hysterese_Kuehlung\",
    \"description\": \"Cooling-Modus: activate_above=28, deactivate_below=24\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [{
      \"type\": \"hysteresis\",
      \"esp_id\": \"${ESP_ID}\",
      \"gpio\": ${SENSOR_GPIO_TEMP},
      \"sensor_type\": \"ds18b20\",
      \"activate_above\": 28.0,
      \"deactivate_below\": 24.0
    }],
    \"actions\": [{
      \"type\": \"actuator\",
      \"esp_id\": \"${ESP_ID}\",
      \"gpio\": ${AKTOR_GPIO},
      \"command\": \"ON\"
    }]
  }")
RULE_D8_ID=$(echo $RULE_D8 | jq -r '.id // .rule_id')
echo "Regel D8 (Hysterese): $RULE_D8_ID"

# Test 8a: 26°C — Zwischen den Schwellen, Startzustand inaktiv → NICHT schalten
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2600,\"raw_mode\":false,\"value\":26.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "Test 8a: 26°C (zwischen Schwellen, inaktiv) — NICHT schalten erwartet"

# Test 8b: 29°C — Ueber activate_above → MUSS schalten (Zustand: aktiv)
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2900,\"raw_mode\":false,\"value\":29.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "Test 8b: 29°C (>28 activate_above) — MUSS schalten"

# Test 8c: 26°C — Zurueck zwischen Schwellen, aber Zustand ist aktiv → BLEIBT aktiv (kein Flapping!)
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2600,\"raw_mode\":false,\"value\":26.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "Test 8c: 26°C (zwischen Schwellen, war aktiv) — BLEIBT aktiv (Hysterese!)"

# Test 8d: 23°C — Unter deactivate_below → Zustand wird inaktiv, NICHT mehr schalten
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2300,\"raw_mode\":false,\"value\":23.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "Test 8d: 23°C (<24 deactivate_below) — Zustand inaktiv, NICHT schalten"

# Verifikation: Server-Logs fuer Hysterese-State-Changes
docker logs automationone-server 2>&1 | grep -i "hysteresis\|state.*change\|activate\|deactivate" | tail -10

# Aufraeumen
curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/rules/${RULE_D8_ID}"
```

### D9 — Szenario 9: Zeitfenster-Condition (Timer-basierte Regeln)

**Ziel:** Regeln die nur in bestimmten Zeitfenstern aktiv sind. Werden vom LogicScheduler (Intervall: default 60s) evaluiert.

```bash
# Aktuelle Serverzeit ermitteln (fuer Zeitfenster-Berechnung)
CURRENT_HOUR=$(date +%H)
CURRENT_MIN=$(date +%M)
echo "Aktuelle Zeit: ${CURRENT_HOUR}:${CURRENT_MIN}"

# Zeitfenster so setzen dass es JETZT aktiv ist (aktuelle Stunde ± 1)
START_H=$(( (10#$CURRENT_HOUR - 1 + 24) % 24 ))
END_H=$(( (10#$CURRENT_HOUR + 1) % 24 ))

# Regel mit reiner Zeitfenster-Condition
RULE_D9A=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D9a_Zeitfenster_Aktiv\",
    \"description\": \"Zeitfenster ${START_H}:00-${END_H}:00 — sollte JETZT aktiv sein\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [{
      \"type\": \"time_window\",
      \"start_hour\": ${START_H},
      \"end_hour\": ${END_H}
    }],
    \"actions\": [{
      \"type\": \"notification\",
      \"channel\": \"websocket\",
      \"target\": \"dashboard\",
      \"message_template\": \"D9a Zeitfenster-Regel gefeuert um {timestamp}\"
    }]
  }")
RULE_D9A_ID=$(echo $RULE_D9A | jq -r '.id // .rule_id')
echo "Regel D9a (Zeitfenster aktiv): $RULE_D9A_ID"

# WICHTIG: Timer-Regeln werden vom LogicScheduler evaluiert (default Intervall: 60s)
# → Warte bis zu 90 Sekunden auf Ausfuehrung
echo "Warte auf LogicScheduler (max 90s)..."
sleep 90

# Pruefen ob Regel gefeuert hat
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/execution_history?rule_id=${RULE_D9A_ID}&limit=5" | jq .

# Regel mit Zeitfenster AUSSERHALB der aktuellen Zeit
OUTSIDE_START=$(( (10#$CURRENT_HOUR + 5) % 24 ))
OUTSIDE_END=$(( (10#$CURRENT_HOUR + 7) % 24 ))

RULE_D9B=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D9b_Zeitfenster_Inaktiv\",
    \"description\": \"Zeitfenster ${OUTSIDE_START}:00-${OUTSIDE_END}:00 — sollte JETZT NICHT aktiv sein\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [{
      \"type\": \"time_window\",
      \"start_hour\": ${OUTSIDE_START},
      \"end_hour\": ${OUTSIDE_END}
    }],
    \"actions\": [{
      \"type\": \"notification\",
      \"channel\": \"websocket\",
      \"message_template\": \"D9b sollte NICHT feuern!\"
    }]
  }")
RULE_D9B_ID=$(echo $RULE_D9B | jq -r '.id // .rule_id')
sleep 90

# D9b darf NICHT gefeuert haben
EXEC_COUNT_D9B=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/execution_history?rule_id=${RULE_D9B_ID}&limit=5" | jq '.items | length // 0')
echo "D9b Executions (erwartet: 0): $EXEC_COUNT_D9B"

# Regel D9c: Zeitfenster + Sensor-Condition (AND-Kombination)
RULE_D9C=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D9c_Zeit_UND_Sensor\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [
      {\"type\": \"time_window\", \"start_hour\": ${START_H}, \"end_hour\": ${END_H}},
      {\"type\": \"sensor\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${SENSOR_GPIO_TEMP}, \"sensor_type\": \"ds18b20\", \"operator\": \">\", \"value\": 25.0}
    ],
    \"actions\": [{\"type\": \"actuator\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${AKTOR_GPIO}, \"command\": \"ON\"}]
  }")
RULE_D9C_ID=$(echo $RULE_D9C | jq -r '.id // .rule_id')

# Sensor-Trigger innerhalb Zeitfenster → MUSS feuern
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2800,\"raw_mode\":false,\"value\":28.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 5
echo "D9c: Sensor 28°C im aktiven Zeitfenster — MUSS feuern"

# Aufraeumen
for RID in $RULE_D9A_ID $RULE_D9B_ID $RULE_D9C_ID; do
  curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/v1/logic/rules/$RID" > /dev/null
done
```

### D10 — Szenario 10: Compound-Conditions (verschachtelte Logik)

**Ziel:** Compound-Evaluator erlaubt verschachtelte AND/OR-Logik innerhalb einer Condition.

```bash
# Compound: (Temp > 25 AND Feuchte < 40) OR (Temp > 35)
# → Verschachtelte Logik in einer einzigen Condition
RULE_D10=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D10_Compound_Verschachtelt\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [{
      \"type\": \"compound\",
      \"logic\": \"OR\",
      \"conditions\": [
        {
          \"type\": \"compound\",
          \"logic\": \"AND\",
          \"conditions\": [
            {\"type\": \"sensor\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${SENSOR_GPIO_TEMP}, \"operator\": \">\", \"value\": 25.0},
            {\"type\": \"sensor\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${SENSOR_GPIO_SOIL}, \"sensor_type\": \"${SOIL_TYPE}\", \"operator\": \"<\", \"value\": 40.0}
          ]
        },
        {\"type\": \"sensor\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${SENSOR_GPIO_TEMP}, \"operator\": \">\", \"value\": 35.0}
      ]
    }],
    \"actions\": [{\"type\": \"actuator\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${AKTOR_GPIO}, \"command\": \"ON\"}]
  }")
RULE_D10_ID=$(echo $RULE_D10 | jq -r '.id // .rule_id')
echo "Regel D10 (Compound): $RULE_D10_ID"

# Falls API "compound" nicht akzeptiert → dokumentieren und weiter
if echo "$RULE_D10" | jq -e '.error // .detail' > /dev/null 2>&1; then
  echo "HINWEIS: Compound-Condition nicht via API akzeptiert — dokumentieren"
else
  # Test 10a: Temp 26°C + Feuchte 30% → Beide AND-Conditions → MUSS feuern
  docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
    -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
    -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2600,\"raw_mode\":false,\"value\":26.0,\"unit\":\"C\",\"quality\":\"good\"}"
  sleep 2
  docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
    -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_SOIL}/data" \
    -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_SOIL},\"sensor_type\":\"${SOIL_TYPE}\",\"raw\":1000,\"raw_mode\":false,\"value\":30.0,\"unit\":\"%\",\"quality\":\"good\"}"
  sleep 5
  echo "Test 10a: Temp 26°C + Feuchte 30% → Compound AND erfuellt → MUSS feuern"

  # Test 10b: Temp 36°C allein → Zweite OR-Branch → MUSS feuern
  docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
    -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
    -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":3600,\"raw_mode\":false,\"value\":36.0,\"unit\":\"C\",\"quality\":\"good\"}"
  sleep 5
  echo "Test 10b: Temp 36°C allein → OR-Branch 2 (>35) → MUSS feuern"

  curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
    "http://localhost:8000/api/v1/logic/rules/${RULE_D10_ID}" > /dev/null
fi
```

### D11 — Szenario 11: Sequence-Action (mehrstufige Aktor-Steuerung)

**Ziel:** Sequence-Executor fuehrt mehrere Schritte nacheinander aus, mit Delays zwischen Steps.
Max 20 concurrent Sequences, max 50 Steps, max 3600s Duration.

```bash
RULE_D11=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D11_Sequence_Bewaesserung\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [{
      \"type\": \"sensor\",
      \"esp_id\": \"${ESP_ID}\",
      \"gpio\": ${SENSOR_GPIO_SOIL},
      \"sensor_type\": \"${SOIL_TYPE}\",
      \"operator\": \"<\",
      \"value\": 30.0
    }],
    \"actions\": [{
      \"type\": \"sequence\",
      \"description\": \"Bewaesserungs-Sequenz: Pumpe an, warten, Pumpe aus\",
      \"abort_on_failure\": true,
      \"max_duration_seconds\": 120,
      \"steps\": [
        {\"name\": \"Pumpe einschalten\", \"action\": {\"type\": \"actuator\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${AKTOR_GPIO}, \"command\": \"ON\"}},
        {\"name\": \"Warten\", \"delay_seconds\": 10},
        {\"name\": \"Pumpe ausschalten\", \"action\": {\"type\": \"actuator\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${AKTOR_GPIO}, \"command\": \"OFF\"}}
      ]
    }]
  }")
RULE_D11_ID=$(echo $RULE_D11 | jq -r '.id // .rule_id')
echo "Regel D11 (Sequence): $RULE_D11_ID"

# Falls Sequence-Action nicht unterstuetzt → dokumentieren
if echo "$RULE_D11" | jq -e '.error // .detail' > /dev/null 2>&1; then
  echo "HINWEIS: Sequence-Action nicht unterstuetzt — dokumentieren"
else
  # Trigger: Feuchte unter 30%
  docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
    -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_SOIL}/data" \
    -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_SOIL},\"sensor_type\":\"${SOIL_TYPE}\",\"raw\":800,\"raw_mode\":false,\"value\":20.0,\"unit\":\"%\",\"quality\":\"good\"}"

  echo "Sequence getriggert — beobachte Schritte (30s)..."
  sleep 5

  # Sequence-Status pruefen via API
  curl -sf -H "Authorization: Bearer $TOKEN" \
    http://localhost:8000/api/v1/sequences | jq '.'

  # Sequence-Stats
  curl -sf -H "Authorization: Bearer $TOKEN" \
    http://localhost:8000/api/v1/sequences/stats | jq '.'

  sleep 20

  # Server-Logs: sequence_started, sequence_step, sequence_completed Events?
  docker logs automationone-server 2>&1 | grep -i "sequence" | tail -15

  curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
    "http://localhost:8000/api/v1/logic/rules/${RULE_D11_ID}" > /dev/null
fi
```

### D12 — Szenario 12: Test/Dry-Run Endpoint

**Ziel:** `POST /rules/{id}/test` fuehrt die Regel mit Mock-Daten aus OHNE Aktoren zu steuern.
Gibt per-Condition und per-Action Ergebnisse zurueck.

```bash
# Test-Regel anlegen (disabled — nur fuer Dry-Run)
RULE_D12=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D12_Dry_Run_Test\",
    \"enabled\": false,
    \"logic_operator\": \"AND\",
    \"conditions\": [
      {\"type\": \"sensor\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${SENSOR_GPIO_TEMP}, \"sensor_type\": \"ds18b20\", \"operator\": \">\", \"value\": 25.0},
      {\"type\": \"sensor\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${SENSOR_GPIO_SOIL}, \"sensor_type\": \"${SOIL_TYPE}\", \"operator\": \"<\", \"value\": 40.0}
    ],
    \"actions\": [{\"type\": \"actuator\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${AKTOR_GPIO}, \"command\": \"ON\"}]
  }")
RULE_D12_ID=$(echo $RULE_D12 | jq -r '.id // .rule_id')
echo "Regel D12 (Dry-Run): $RULE_D12_ID"

# Test 12a: Dry-Run mit Mock-Werten die BEIDE Conditions erfuellen
echo "=== Dry-Run: Beide Conditions TRUE ==="
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  "http://localhost:8000/api/v1/logic/rules/${RULE_D12_ID}/test" \
  -d "{
    \"mock_sensor_values\": {
      \"${ESP_ID}:${SENSOR_GPIO_TEMP}\": 28.0,
      \"${ESP_ID}:${SENSOR_GPIO_SOIL}\": 25.0
    },
    \"dry_run\": true
  }" | jq '{would_trigger, condition_results: [.condition_results[] | {index: .condition_index, type: .condition_type, result, actual_value}], action_results: [.action_results[] | {index: .action_index, type: .action_type, would_execute, dry_run}]}'

# Test 12b: Dry-Run mit Mock-Werten die nur EINE Condition erfuellen (AND → false)
echo "=== Dry-Run: Nur eine Condition TRUE (AND → false) ==="
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  "http://localhost:8000/api/v1/logic/rules/${RULE_D12_ID}/test" \
  -d "{
    \"mock_sensor_values\": {
      \"${ESP_ID}:${SENSOR_GPIO_TEMP}\": 28.0,
      \"${ESP_ID}:${SENSOR_GPIO_SOIL}\": 60.0
    },
    \"dry_run\": true
  }" | jq '{would_trigger, condition_results: [.condition_results[] | {index: .condition_index, result, actual_value}]}'

# Test 12c: Dry-Run mit mock_time fuer Time-Window
echo "=== Dry-Run: Mock-Time ==="
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  "http://localhost:8000/api/v1/logic/rules/${RULE_D12_ID}/test" \
  -d "{
    \"mock_sensor_values\": {\"${ESP_ID}:${SENSOR_GPIO_TEMP}\": 28.0, \"${ESP_ID}:${SENSOR_GPIO_SOIL}\": 25.0},
    \"mock_time\": \"14:30\",
    \"dry_run\": true
  }" | jq '.'

curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/rules/${RULE_D12_ID}" > /dev/null
```

**Verifikation D12:**
- `would_trigger: true` bei beiden Conditions erfuellt
- `would_trigger: false` bei nur einer Condition (AND)
- Jede Condition hat `result: true/false` und `actual_value`
- Actions haben `dry_run: true` und `would_execute: true/false`
- KEIN Aktor wurde wirklich geschaltet (Dry-Run!)

### D13 — Szenario 13: Toggle-Endpoint + Execution-History

**Ziel:** Enable/Disable per Toggle, History-Abfrage verifizieren.

```bash
# Regel anlegen und triggern
RULE_D13=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D13_Toggle_History\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [{\"type\": \"sensor\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${SENSOR_GPIO_TEMP}, \"operator\": \">\", \"value\": 24.0}],
    \"actions\": [{\"type\": \"notification\", \"channel\": \"websocket\", \"message_template\": \"D13 gefeuert\"}]
  }")
RULE_D13_ID=$(echo $RULE_D13 | jq -r '.id // .rule_id')

# 1x triggern → Execution-History entsteht
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2600,\"raw_mode\":false,\"value\":26.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 5

# Execution-History abfragen
echo "=== Execution-History ==="
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/execution_history?rule_id=${RULE_D13_ID}&limit=10" | jq '.'

# Toggle: Disable
echo "=== Toggle: DISABLE ==="
TOGGLE_OFF=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  "http://localhost:8000/api/v1/logic/rules/${RULE_D13_ID}/toggle" \
  -d '{"enabled": false, "reason": "D13-Test: deaktiviert"}')
echo "$TOGGLE_OFF" | jq '{success, enabled, previous_state}'

# Trigger erneut → DARF NICHT feuern (disabled)
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2800,\"raw_mode\":false,\"value\":28.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "Nach Toggle OFF: Regel darf NICHT feuern"

# Toggle: Re-Enable
echo "=== Toggle: RE-ENABLE ==="
TOGGLE_ON=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  "http://localhost:8000/api/v1/logic/rules/${RULE_D13_ID}/toggle" \
  -d '{"enabled": true}')
echo "$TOGGLE_ON" | jq '{success, enabled, previous_state}'

# Trigger nochmal → MUSS wieder feuern
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2800,\"raw_mode\":false,\"value\":28.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 5
echo "Nach Toggle ON: Regel MUSS wieder feuern"

# Gesamt-History (alle Regeln)
echo "=== Gesamt Execution-History ==="
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/execution_history?limit=20" | \
  jq '{total: .total, items: [.items[] | {rule_name: .rule_name, success, execution_time_ms, timestamp}]}'

curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/rules/${RULE_D13_ID}" > /dev/null
```

### D14 — Szenario 14: Cross-ESP Logic (Kern-Feature!)

**Ziel:** Conditions referenzieren Sensoren auf VERSCHIEDENEN ESPs. Die Logic Engine laedt Cross-Sensor-Werte aus der DB (`_load_cross_sensor_values`).

```bash
# Pruefen ob mehr als ein ESP in der DB ist
echo "=== Verfuegbare ESPs ==="
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/esp/devices | jq '[.[] | {esp_id, name, status, zone_id}]'

# Falls nur 1 ESP: Test mit MQTT-Inject fuer zweiten ESP (simuliert)
# Falls >1 ESP: Echte Cross-ESP Regel

# Variante A: Cross-ESP mit echten 2 ESPs
# ESP2_ID aus der Query oben ermitteln
# ESP2_SENSOR_GPIO aus sensor_configs ermitteln

# Variante B: Cross-ESP mit 1 ESP + MQTT-Inject fuer virtuellen zweiten Sensor
# → Sensor-Daten fuer zweiten GPIO injizieren, Regel referenziert beide GPIOs

RULE_D14=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D14_Cross_ESP_oder_Cross_Sensor\",
    \"description\": \"Sensor A (Temp) + Sensor B (Feuchte) auf verschiedenen GPIOs\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"conditions\": [
      {\"type\": \"sensor\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${SENSOR_GPIO_TEMP}, \"sensor_type\": \"ds18b20\", \"operator\": \">\", \"value\": 25.0},
      {\"type\": \"sensor\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${SENSOR_GPIO_SOIL}, \"sensor_type\": \"${SOIL_TYPE}\", \"operator\": \"<\", \"value\": 40.0}
    ],
    \"actions\": [{\"type\": \"actuator\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${AKTOR_GPIO}, \"command\": \"ON\"}]
  }")
RULE_D14_ID=$(echo $RULE_D14 | jq -r '.id // .rule_id')
echo "Regel D14 (Cross-Sensor): $RULE_D14_ID"

# KRITISCHER TEST: Nur Sensor A triggern → Logic Engine muss Sensor B aus DB laden!
# Zuerst Feuchte-Wert injizieren (damit DB einen Wert hat)
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_SOIL}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_SOIL},\"sensor_type\":\"${SOIL_TYPE}\",\"raw\":800,\"raw_mode\":false,\"value\":25.0,\"unit\":\"%\",\"quality\":\"good\"}"
sleep 2

# Jetzt NUR Temperatur triggern → Engine muss letzten Feuchte-Wert (25%) aus DB holen
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2800,\"raw_mode\":false,\"value\":28.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 5
echo "D14: Nur Temp getriggert → Engine muss Feuchte aus DB laden → MUSS feuern (28>25 AND 25<40)"

# Verifikation: Server-Logs fuer cross_sensor_values
docker logs automationone-server 2>&1 | grep -i "cross.*sensor\|load.*sensor\|preload" | tail -5

# Gegentest: Feuchte auf 60% setzen, dann nur Temp triggern → DARF NICHT feuern
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_SOIL}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_SOIL},\"sensor_type\":\"${SOIL_TYPE}\",\"raw\":2400,\"raw_mode\":false,\"value\":60.0,\"unit\":\"%\",\"quality\":\"good\"}"
sleep 2
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2800,\"raw_mode\":false,\"value\":28.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 5
echo "D14 Gegentest: Temp 28°C aber Feuchte 60% → DARF NICHT feuern (60 > 40)"

curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/rules/${RULE_D14_ID}" > /dev/null
```

### D15 — Szenario 15: Priority + Cooldown + max_executions_per_hour

**Ziel:** Rule-Priority beeinflusst ConflictManager. Cooldown und Rate-Limit verifizieren.

```bash
# Regel mit Priority=1 (hoch), Cooldown=30s, max 5/Stunde
RULE_D15=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"D15_Priority_Cooldown_Rate\",
    \"enabled\": true,
    \"logic_operator\": \"AND\",
    \"priority\": 1,
    \"cooldown_seconds\": 30,
    \"max_executions_per_hour\": 5,
    \"conditions\": [{\"type\": \"sensor\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${SENSOR_GPIO_TEMP}, \"operator\": \">\", \"value\": 24.0}],
    \"actions\": [{\"type\": \"notification\", \"channel\": \"websocket\", \"message_template\": \"D15 Priority-Test\"}]
  }")
RULE_D15_ID=$(echo $RULE_D15 | jq -r '.id // .rule_id')
echo "Regel D15: $RULE_D15_ID (priority=1, cooldown=30s, max=5/h)"

# 1. Trigger → MUSS feuern
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2600,\"raw_mode\":false,\"value\":26.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "1. Trigger — MUSS feuern"

# 2. Sofort nochmal triggern (innerhalb 30s Cooldown) → DARF NICHT feuern
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2700,\"raw_mode\":false,\"value\":27.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "2. Trigger (5s nach 1.) — Cooldown 30s → DARF NICHT feuern"

# Server-Logs: Cooldown-Skip sichtbar?
docker logs automationone-server 2>&1 | grep -i "cooldown\|skip\|rate" | tail -5

# 3. Warte Cooldown ab, dann nochmal
echo "Warte 30s fuer Cooldown-Ablauf..."
sleep 30
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2600,\"raw_mode\":false,\"value\":26.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "3. Trigger (nach Cooldown) — MUSS wieder feuern"

# Execution-Count pruefen
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/execution_history?rule_id=${RULE_D15_ID}&limit=10" | \
  jq '{total: .total, items: [.items[] | {success, execution_time_ms, timestamp}]}'

curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/rules/${RULE_D15_ID}" > /dev/null
```

### D16 — Alle D-Test-Regeln final aufraeumen

```bash
# Alle verbleibenden Test-Regeln loeschen (ausser D1 fuer Block G)
curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/logic/rules | \
  jq -r '.items[]? // .[]? | select(.name | test("^D[0-9]")) | .id' | \
  while read id; do
    if [ "$id" != "$RULE_D1_ID" ]; then
      curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
        "http://localhost:8000/api/v1/logic/rules/$id" > /dev/null
      echo "Geloescht: $id"
    fi
  done
echo "Regel D1 ($RULE_D1_ID) behalten fuer Block G"

# Monitoring stoppen
kill $MQTT_CMD_PID $LOG_PID 2>/dev/null
```

### D — Ergebnis-Checkliste

- [ ] **D0:** API-Schema vollstaendig dokumentiert (Condition-Typen, Action-Typen, Felder)
- [ ] **D1: GATE-KEEPER** — Einfacher Schwellwert feuert (MQTT-Command sichtbar)
- [ ] **D1:** Auto-Off-Verhalten dokumentiert (bleibt ON oder geht AUS)
- [ ] **D2:** AND-Logik korrekt — eine Bedingung allein reicht NICHT
- [ ] **D2:** AND-Logik korrekt — beide Bedingungen zusammen feuern Aktor
- [ ] **D3:** OR-Logik korrekt — eine Bedingung reicht fuer Trigger
- [ ] **D4:** Mehrere Regeln parallel evaluiert bei einem Sensor-Event
- [ ] **D5:** Verzoegerung getestet (oder "nicht unterstuetzt" dokumentiert)
- [ ] **D5:** Cooldown getestet (oder "nicht unterstuetzt" dokumentiert)
- [ ] **D6:** ConflictManager gibt klare Log-Message bei Konflikt
- [ ] **D6:** RateLimiter gibt klare Log-Message bei Rate-Limit
- [ ] **D8:** Hysterese: Zustand bleibt aktiv zwischen Schwellen (kein Flapping)
- [ ] **D8:** Hysterese: Zustand wechselt korrekt an activate/deactivate Grenzen
- [ ] **D9:** Zeitfenster: Regel feuert nur im aktiven Fenster
- [ ] **D9:** Zeitfenster: Regel feuert NICHT ausserhalb des Fensters
- [ ] **D9:** Zeitfenster + Sensor: AND-Kombination funktioniert
- [ ] **D10:** Compound-Conditions: Verschachtelte AND/OR-Logik evaluiert korrekt
- [ ] **D11:** Sequence-Action: Mehrstufige Ausfuehrung mit Delays zwischen Steps
- [ ] **D11:** Sequence-API: Status, Stats, Cancel-Endpunkte funktionieren
- [ ] **D12:** Test/Dry-Run: `would_trigger` korrekt, `condition_results` pro Condition
- [ ] **D12:** Test/Dry-Run: `mock_sensor_values` ueberschreiben echte Werte
- [ ] **D12:** Test/Dry-Run: Kein Aktor geschaltet bei `dry_run: true`
- [ ] **D13:** Toggle: Disable → Regel feuert nicht, Enable → feuert wieder
- [ ] **D13:** Execution-History: Eintraege vorhanden mit `execution_time_ms`
- [ ] **D14:** Cross-ESP/Cross-Sensor: Engine laedt fehlende Sensor-Werte aus DB
- [ ] **D14:** Cross-ESP: Gegentest — falscher DB-Wert verhindert Trigger
- [ ] **D15:** Priority verifiziert (niedrigere Zahl = hoeher)
- [ ] **D15:** Cooldown: Trigger innerhalb Cooldown wird uebersprungen
- [ ] **D15:** max_executions_per_hour: Rate-Limit greift
- [ ] **Fix-Log:** Alle gefundenen + gefixten Probleme dokumentiert
- [ ] Alle Test-Regeln bereinigt (nur D1 bleibt fuer Block G)

**Zeitschaetzung Block D:** 5-6 Stunden

---

## Block G: Aktor-Verifikation + Wokwi-Feedback-Loop

**Ziel:** Sicherstellen dass Aktoren in der Wokwi-Simulation wirklich reagieren. End-to-End-Feedback-Loop: Sensor aendert sich → Regel feuert → Aktor schaltet → Wokwi-Simulation reagiert.

### G1 — Aktor-Hardware im Wokwi-Diagramm identifizieren

```bash
# Aktor-Typen im Wokwi-Diagramm
cat "El Trabajante/tests/wokwi/diagram.json" 2>/dev/null | \
  jq '[.parts[] | select(.type | test("led|relay|pump|motor|pwm"; "i"))]' 2>/dev/null

# Aktor-GPIO mit DB abgleichen
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT id, esp_id, name, actuator_type, gpio, status, is_active, last_command
   FROM actuator_configs ORDER BY esp_id;"
```

### G2 — Manueller Aktor-Test (API → MQTT → Wokwi)

```bash
# MQTT-Commands beobachten
docker exec automationone-mqtt mosquitto_sub \
  -h localhost -p 1883 \
  -t "kaiser/+/esp/+/actuator/+/command" \
  -C 1 -W 10 -v &

# Aktor EIN via API
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  "http://localhost:8000/api/v1/actuators/${AKTOR_ID}/command" \
  -d '{"command": "on", "duration": 5}'
sleep 7

# Aktor AUS via API
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  "http://localhost:8000/api/v1/actuators/${AKTOR_ID}/command" \
  -d '{"command": "off"}'
```

### G3 — Frontend Aktor-Visualisierung (Playwright)

```javascript
// Playwright: Aktor-Status im Frontend pruefen
browser_navigate({ url: "http://localhost:5173/hardware" })
browser_snapshot()
// ESP finden → Aktoren-Sektion suchen → Status pruefen
browser_screenshot({ filename: "g03_actuator_view.png" })
```

### G4 — E2E Feedback-Loop (Sensor → Regel → Aktor → Wokwi)

```bash
# Vollstaendiger Loop mit Regel D1 (die noch aktiv ist):
# Temperatur 28°C senden → D1 feuert → Aktor ON

echo "E2E-LOOP START"
docker exec automationone-mqtt mosquitto_sub \
  -h localhost -p 1883 \
  -t "kaiser/+/esp/+/actuator/+/command" \
  -C 1 -W 15 -v &

docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2800,\"raw_mode\":false,\"value\":28.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 8

# Aktor-Status verifizieren
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/actuators/${AKTOR_ID}" | jq '{id, status, last_command}'

echo "E2E-LOOP ENDE — Command auf MQTT sichtbar?"

# Regel D1 jetzt loeschen
curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/rules/${RULE_D1_ID}"
echo "Regel D1 geloescht"
```

### G — Checkliste

- [ ] Aktor-Hardware im Wokwi-Diagramm identifiziert (Typ, GPIO)
- [ ] Manueller Aktor-Test: API → MQTT-Command sichtbar
- [ ] Frontend zeigt Aktor-Status korrekt (ON/OFF)
- [ ] E2E-Loop: Sensor-Trigger → Regel → MQTT-Command → Aktor-Status
- [ ] Wokwi-Reaktion dokumentiert (reagiert die Simulation sichtbar?)

**Zeitschaetzung Block G:** 1.5 Stunden

---

## Block E: Error-Handling + Edge Cases

**Ziel:** Die Logic Engine gegen Fehler-Eingaben haerten. Was passiert bei unvollstaendigen Daten, offline ESPs, kaputten Sensor-Werten?

### E1 — Ungueltige Regelkonfigurationen

```bash
# E1a: Nicht-existenter ESP in Condition
HTTP_E1A=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d '{
    "name": "E1a_Nonexistent_ESP",
    "enabled": true,
    "conditions": [{"type": "sensor_threshold", "sensor_type": "ds18b20", "esp_id": "ESP_NICHT_EXISTENT", "operator": ">", "value": 25}],
    "actions": []
  }')
echo "Nicht-existenter ESP: HTTP $HTTP_E1A (erwartet: 400/422)"

# E1b: Nicht-existenter Aktor in Action
HTTP_E1B=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d "{
    \"name\": \"E1b_Nonexistent_Actuator\",
    \"enabled\": true,
    \"conditions\": [{\"type\": \"sensor_threshold\", \"sensor_type\": \"ds18b20\", \"esp_id\": \"${ESP_ID}\", \"operator\": \">\", \"value\": 25}],
    \"actions\": [{\"type\": \"actuator_command\", \"actuator_id\": \"99999999\", \"command\": \"on\"}]
  }")
echo "Nicht-existenter Aktor: HTTP $HTTP_E1B (erwartet: 400/422)"

# E1c: Leere Regel (keine Conditions, keine Actions)
HTTP_E1C=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d '{"name": "E1c_Leere_Regel", "enabled": true, "conditions": [], "actions": []}')
echo "Leere Regel: HTTP $HTTP_E1C (Validierung sollte blockieren)"

# Bereinigung
curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/logic/rules | \
  jq -r '.[] | select(.name | test("^E1")) | .id' | \
  while read id; do
    curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
      "http://localhost:8000/api/v1/logic/rules/$id" > /dev/null
  done
```

### E2 — Sensor-Daten-Qualitaet

```bash
# E2a: NaN/null im Sensorwert — Regel soll NICHT feuern
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":null,\"raw_mode\":false,\"value\":null,\"unit\":\"C\",\"quality\":\"bad\"}"
sleep 3
echo "NaN/null Sensor-Wert: Regel sollte NICHT feuern"
docker logs automationone-server 2>&1 | grep -E "null|NaN|quality|invalid" | tail -5

# E2b: Out-of-Range Wert (1000°C)
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":100000,\"raw_mode\":false,\"value\":1000.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "Out-of-Range 1000°C: Range-Check vorhanden?"
```

### E3 — ESP offline waehrend Regel aktiv

```bash
# LWT senden (simuliert ESP-Offline)
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/system/lwt" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"status\":\"offline\"}"
sleep 3

# Sensor-Daten nach Offline senden
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":2800,\"raw_mode\":false,\"value\":28.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 3
echo "Sensor-Daten nach Offline: Graceful Handling?"
docker logs automationone-server 2>&1 | grep -E "offline|lwt|inactive" | tail -10

# ESP wieder online bringen
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/system/heartbeat" \
  -m "{\"ts\":$(date +%s),\"uptime\":99000,\"heap_free\":200000,\"wifi_rssi\":-55}"
```

### E4 — Performance-Test: 10 Regeln gleichzeitig

```bash
for i in $(seq 1 10); do
  curl -sf -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    http://localhost:8000/api/v1/logic/rules \
    -d "{
      \"name\": \"E4_Perf_${i}\",
      \"enabled\": true,
      \"logic_operator\": \"AND\",
      \"conditions\": [{\"type\": \"sensor_threshold\", \"sensor_type\": \"ds18b20\", \"esp_id\": \"${ESP_ID}\", \"operator\": \">\", \"value\": $((20 + i))}],
      \"actions\": [{\"type\": \"actuator_command\", \"actuator_id\": \"${AKTOR_ID}\", \"command\": \"on\"}]
    }" > /dev/null
done
echo "10 Regeln angelegt"

# Alle 10 gleichzeitig triggern
START_PERF=$(date +%s%N)
docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
  -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"${ESP_ID}\",\"gpio\":${SENSOR_GPIO_TEMP},\"sensor_type\":\"ds18b20\",\"raw\":3500,\"raw_mode\":false,\"value\":35.0,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 5
END_PERF=$(date +%s%N)
echo "10-Regeln-Evaluation: $((($END_PERF - $START_PERF) / 1000000))ms"
docker logs automationone-server 2>&1 | grep -E "logic|evaluation|execution" | tail -15

# Bereinigung
curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/logic/rules | \
  jq -r '.[] | select(.name | test("^E4_")) | .id' | \
  while read id; do
    curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
      "http://localhost:8000/api/v1/logic/rules/$id" > /dev/null
  done
```

### E — Checkliste

- [ ] Nicht-existenter ESP: 400/422 oder dokumentiertes Verhalten
- [ ] Nicht-existenter Aktor: Klare Fehlermeldung, kein Server-Crash
- [ ] Leere Regel: Validierung blockiert
- [ ] NaN/null Sensorwert: Regel evaluiert NICHT (kein False-Positive)
- [ ] Out-of-Range 1000°C: Range-Check vorhanden?
- [ ] ESP offline: Graceful Handling
- [ ] 10-Regeln-Performance: Evaluation-Zeit < 500ms

**Zeitschaetzung Block E:** 1.5 Stunden

---

## Block C: Frontend Rule Builder Deep-Dive (Playwright MCP)

**Ziel:** Den Vue-Flow-Rule-Builder systematisch durchklicken. Jede Palette-Kategorie, jeden Node-Typ, jede Config-Option, ESP/Sensor-Auswahl, Verbindungen, Speichern, Laden, Templates. Basierend auf verifizierter Codebase-Analyse (5 Components, 6 Node-Typen, 14 Palette-Items, 6 Templates).

**Voraussetzung:** Block D abgeschlossen (Logic Engine serverseitig verifiziert). Frontend laeuft: `http://localhost:5173`.

**Architektur-Wissen fuer den Agenten:**
- Route: `/logic` (Leerzustand mit RuleCards + Templates) oder `/logic/:ruleId` (Editor-Modus)
- Layout: Links RuleNodePalette (248px) | Mitte VueFlow Canvas | Rechts RuleConfigPanel (288px, nur bei Node-Selektion)
- ESP-Daten kommen aus `espStore.devices` (vorgeladen), NICHT per API-Call im Editor
- Node-Typen: `sensor`, `time`, `logic`, `actuator`, `notification`, `delay`
- Connection-Validation: sensor/time → logic → actuator/notification (NICHT direkt sensor→actuator!)
- Save: `graphToRuleData()` konvertiert Nodes → API-Schema, PWM: `pwmValue/100` (Frontend 0-100% → Backend 0.0-1.0)
- Neue Regeln werden mit `enabled: false` erstellt

### C1 — Login + Rule Builder Navigation

```
# Schritt 1: Login im Frontend
browser_navigate({ url: "http://localhost:5173/login" })
browser_snapshot()
# Login-Formular ausfuellen (admin / Admin123#)
browser_fill_form({ fields: [
  { name: "username", type: "textbox", ref: "USERNAME_REF", value: "admin" },
  { name: "password", type: "textbox", ref: "PASSWORD_REF", value: "Admin123#" }
] })
browser_click({ ref: "LOGIN_BUTTON_REF", element: "Login button" })
browser_wait_for({ text: "Dashboard" })

# Schritt 2: Zur Logic-Seite navigieren
# Sidebar: Zweiter Link "Regeln" (Workflow-Icon)
browser_snapshot()
browser_click({ ref: "REGELN_SIDEBAR_REF", element: "Regeln link in sidebar" })
browser_wait_for({ text: "Automatisierung" })
browser_screenshot({ filename: "c01_logic_initial.png", type: "png" })
browser_console_messages({ level: "error" })
```

**Verifikation C1:**
- URL ist `/logic`
- Keine JS-Errors in Console
- Seite zeigt: RuleCards (falls Regeln aus Block D noch existieren) + Template-Grid
- Kein 401/403 Error

### C2 — Leerzustand + Template-Ansicht inventarisieren

```
browser_snapshot()
# Wenn keine Regeln vorhanden: Nur Templates sichtbar
# Wenn Regeln vorhanden: RuleCards + Templates (collapsible)
browser_screenshot({ filename: "c02_empty_state.png", type: "png" })

# Templates zaehlen (erwartet: 6)
# - Temperatur-Alarm (climate, blau)
# - Bewaesserungs-Zeitplan (irrigation, gruen)
# - Luftfeuchte-Regelung (climate, blau)
# - Nacht-Modus (schedule, lila)
# - pH-Alarm (safety, rot)
# - Notfall-Abschaltung (safety, rot)
```

**PRUEFEN:**
- [ ] Alle 6 Templates sichtbar mit korrektem Icon + Kategorie-Badge?
- [ ] Template-Sektion ist collapsible? (State in localStorage `logic-templates-collapsed`)
- [ ] Jedes Template hat "Verwenden"-Button?

### C3 — Template verwenden: Temperatur-Alarm

```
# Template "Temperatur-Alarm" klicken → Editor-Modus mit vorbefuellten Nodes
browser_snapshot()
browser_click({ ref: "TEMP_ALARM_TEMPLATE_REF", element: "Temperatur-Alarm template card" })
browser_wait_for({ time: 1 })
browser_snapshot()
browser_screenshot({ filename: "c03_template_loaded.png", type: "png" })

# PRUEFEN:
# - Editor-Modus aktiv (Canvas sichtbar)?
# - Nodes vorbefuellt: 1x Sensor (DS18B20, >30°C) + 1x Logic (AND) + 1x Actuator (ON)?
# - Regel-Name im Toolbar: "Temperatur-Alarm"?
# - Palette links sichtbar?
# - Keine Config-Panel rechts (kein Node selektiert)?
```

### C4 — Sensor-Node konfigurieren (ESP-Dropdown, GPIO, Schwellwert)

```
# Sensor-Node auf Canvas anklicken → Config-Panel rechts oeffnet sich
browser_click({ ref: "SENSOR_NODE_REF", element: "Sensor node on canvas" })
browser_snapshot()
browser_screenshot({ filename: "c04_sensor_config.png", type: "png" })

# PRUEFEN im Config-Panel:
# 1. ESP-Device-Dropdown vorhanden?
# 2. Dropdown zeigt echte ESPs aus espStore (ESP_IDs aus Block A)?
# 3. NICHT Platzhalter/Dummy-Daten?

# ESP auswaehlen
browser_click({ ref: "ESP_DROPDOWN_REF", element: "ESP device dropdown" })
browser_snapshot()
# → Dropdown-Optionen zeigen ESP-IDs
browser_select_option({ ref: "ESP_DROPDOWN_REF", values: ["ESP_ID_AUS_BLOCK_A"] })
browser_snapshot()

# Nach ESP-Auswahl: Sensor-Dropdown erscheint (device-aware)
# PRUEFEN:
# - Zeigt NUR Sensoren dieses ESPs (aus device.sensors[])
# - Format: "DS18B20 (GPIO 4)" / "soil_moisture (GPIO 34)"
# - Oder Fallback: Manueller GPIO-Input + SensorType-Select (wenn ESP keine Sensoren hat)

# Sensor auswaehlen → auto-fills gpio + sensorType
browser_select_option({ ref: "SENSOR_DROPDOWN_REF", values: ["DS18B20_OPTION"] })
browser_snapshot()

# Operator-Dropdown pruefen (7 Optionen: >, >=, <, <=, ==, !=, between)
browser_click({ ref: "OPERATOR_DROPDOWN_REF", element: "Operator dropdown" })
browser_snapshot()

# Schwellwert aendern auf 25
browser_type({ ref: "VALUE_INPUT_REF", text: "25" })
browser_snapshot()
browser_screenshot({ filename: "c04_sensor_configured.png", type: "png" })

# Between-Operator testen:
browser_select_option({ ref: "OPERATOR_DROPDOWN_REF", values: ["between"] })
browser_snapshot()
# → Min/Max-Inputs erscheinen statt einzelnem Value-Input
browser_screenshot({ filename: "c04_between_operator.png", type: "png" })
# Zurueck zu ">"
browser_select_option({ ref: "OPERATOR_DROPDOWN_REF", values: [">"] })
```

**KRITISCHE FRAGEN C4:**
- [ ] ESP-Dropdown laedt echte ESPs aus `espStore.devices`?
- [ ] Sensor-Dropdown ist ESP-spezifisch (filtert `device.sensors[]`)?
- [ ] GPIO + sensorType werden automatisch gesetzt bei Sensor-Auswahl?
- [ ] Bei ESP ohne Sensoren: Fallback zu manuellem GPIO-Input?
- [ ] Between-Operator zeigt Min/Max-Felder?

### C5 — Actuator-Node konfigurieren (Aktor-Auswahl, Kommando, PWM)

```
# Actuator-Node auf Canvas anklicken
browser_click({ ref: "ACTUATOR_NODE_REF", element: "Actuator node on canvas" })
browser_snapshot()
browser_screenshot({ filename: "c05_actuator_config.png", type: "png" })

# ESP-Dropdown → selben ESP auswaehlen
browser_select_option({ ref: "ACTUATOR_ESP_DROPDOWN_REF", values: ["ESP_ID"] })
browser_snapshot()

# Actuator-Dropdown (device-aware: filtert device.actuators[])
browser_select_option({ ref: "ACTUATOR_DROPDOWN_REF", values: ["ACTUATOR_OPTION"] })
browser_snapshot()

# Command-Dropdown testen: ON, OFF, PWM, TOGGLE
browser_click({ ref: "COMMAND_DROPDOWN_REF", element: "Command dropdown" })
browser_snapshot()

# PWM-Modus testen → Range-Slider (0-100%) erscheint
browser_select_option({ ref: "COMMAND_DROPDOWN_REF", values: ["PWM"] })
browser_snapshot()
browser_screenshot({ filename: "c05_pwm_slider.png", type: "png" })
# → Slider vorhanden? Wert anzeigbar?
# WICHTIG: Frontend speichert pwmValue 0-100, Backend erwartet value 0.0-1.0 (Konvertierung in graphToRuleData)

# Duration-Input (Auto-Off Sekunden)
# → Feld vorhanden? Nur bei ON/PWM relevant?

# Zurueck zu ON
browser_select_option({ ref: "COMMAND_DROPDOWN_REF", values: ["ON"] })
```

### C6 — Palette: Alle 14 Node-Typen per Drag-and-Drop auf Canvas

```
# Palette links durchgehen — 3 Kategorien, 14 Items total

## Kategorie 1: Bedingungen (blau, 9 Items)
# Jedes Item per Drag-and-Drop auf Canvas ziehen und pruefen

# 6a: Temperatur-Sensor (DS18B20)
# Drag von Palette → Canvas
browser_snapshot()
# Item finden: "Sensor" (Default: DS18B20, >, 25)
# Drag-and-Drop: DataTransfer = application/rulenode → {type: "sensor", label: "Sensor", defaults: {sensorType: "DS18B20", operator: ">", value: 25}}
# → Neuer sensor-Node auf Canvas

# 6b: Feuchtigkeit (SHT31, <, 40)
# 6c: pH-Wert (pH, between, 6, min: 5.5, max: 7.0)
# 6d: Licht (light, <, 500)
# 6e: CO2 (co2, >, 1000)
# 6f: Bodenfeuchte (moisture, <, 30) — ACHTUNG: Palette nutzt "moisture", NICHT "soil_moisture"!
# 6g: EC-Wert (EC, between, 1.2, min: 0.8, max: 2.0)
# 6h: Fuellstand (level, <, 20)
# 6i: Zeitfenster (time-Node: startHour: 8, endHour: 18)

## Kategorie 2: Logik (lila, 2 Items)
# 6j: UND (logic-Node: operator: AND)
# 6k: ODER (logic-Node: operator: OR)

## Kategorie 3: Aktionen (violet, 3 Items)
# 6l: Aktor steuern (actuator-Node: command: ON)
# 6m: Benachrichtigung (notification-Node: channel: websocket)
# 6n: Verzoegerung (delay-Node: seconds: 60)

# NACH jedem Drag: Snapshot + Screenshot
browser_screenshot({ filename: "c06_all_nodes_on_canvas.png", type: "png" })

# PRUEFEN:
# - Alle 14 Nodes auf Canvas?
# - Jeder Node hat korrektes Icon und Label?
# - Nodes lassen sich frei positionieren (Snap-to-Grid: 20x20px)?
# - Palette-Suchfunktion: Eingabe "Temp" filtert auf Temperatur-Sensor?
```

### C7 — Verbindungen (Edges) + Connection Validation

```
# Connection-Regeln (aus logic.store.ts):
# ERLAUBT: sensor → logic, time → logic, logic → actuator, logic → notification, logic → delay
# VERBOTEN: sensor → actuator (DIREKT!), actuator → irgendwas, notification → irgendwas
# VERBOTEN: Self-loops

# Test 7a: Gueltige Verbindung: sensor → logic (UND)
# Drag von sensor Output-Handle → logic Input-Handle
browser_snapshot()
# Verbindung ziehen...
browser_screenshot({ filename: "c07_valid_connection.png", type: "png" })

# Test 7b: UNGUELTIGE Verbindung: sensor → actuator (DIREKT)
# → Muss blockiert werden! Validation-Message erwartet
browser_snapshot()
# Verbindung versuchen...
# PRUEFEN: Wird die Verbindung abgelehnt? Fehlermeldung?

# Test 7c: UNGUELTIGE Verbindung: actuator → sensor (Terminal-Node als Source)
# → actuator/notification sind terminal (nur Input, kein Output)

# Test 7d: Self-loop: sensor → sensor
# → Muss blockiert werden

# Test 7e: Vollstaendige Kette bauen:
# sensor (Temp) → logic (UND) ← sensor (Feuchte)
# logic (UND) → actuator (ON)
# → Das ist die Standard-Regel-Topologie
browser_screenshot({ filename: "c07_complete_chain.png", type: "png" })
```

**KRITISCHE FRAGEN C7:**
- [ ] Sensor → Actuator DIREKT wird BLOCKIERT?
- [ ] Fehlermeldung bei ungueltiger Verbindung sichtbar?
- [ ] Animated smoothstep Edges mit Arrow-Marker sichtbar?
- [ ] MiniMap zeigt Nodes korrekt?

### C8 — Zeitfenster-Node konfigurieren

```
# Time-Node anklicken → Config-Panel
browser_click({ ref: "TIME_NODE_REF", element: "Time node" })
browser_snapshot()
browser_screenshot({ filename: "c08_time_config.png", type: "png" })

# PRUEFEN:
# - Start-Hour Input (0-23)
# - End-Hour Input (0-23)
# - Wochentag-Toggles (Mo-So = 0-6): 7 Toggle-Buttons
# - Overnight-Wrapping darstellbar? (z.B. 22:00-06:00)
# Werte aendern:
browser_type({ ref: "START_HOUR_REF", text: "22" })
browser_type({ ref: "END_HOUR_REF", text: "6" })
# Wochentage: Mo-Fr selektieren (0-4)
browser_snapshot()
browser_screenshot({ filename: "c08_time_overnight.png", type: "png" })
```

### C9 — Notification-Node konfigurieren

```
# Notification-Node anklicken → Config-Panel
browser_click({ ref: "NOTIFICATION_NODE_REF", element: "Notification node" })
browser_snapshot()

# PRUEFEN:
# - Channel-Select: websocket, email, webhook
# - Target-Input: Text
# - Message-Template Textarea
# - Template-Variablen-Hinweis: {value}, {sensor_type}, {esp_id}, {timestamp}

# Channel auf "email" wechseln
browser_select_option({ ref: "CHANNEL_SELECT_REF", values: ["email"] })
browser_snapshot()
# → Target-Feld zeigt "E-Mail-Adresse"?

# Channel auf "webhook" wechseln
browser_select_option({ ref: "CHANNEL_SELECT_REF", values: ["webhook"] })
browser_snapshot()
# → Target-Feld zeigt URL-Format?

browser_screenshot({ filename: "c09_notification_config.png", type: "png" })
```

### C10 — Delay-Node konfigurieren

```
# Delay-Node anklicken → Config-Panel
browser_click({ ref: "DELAY_NODE_REF", element: "Delay node" })
browser_snapshot()

# PRUEFEN:
# - Seconds-Input (1-86400)
# - Menschenlesbare Anzeige: "X Min. Y Sek."
browser_type({ ref: "DELAY_SECONDS_REF", text: "90" })
browser_snapshot()
# → Zeigt "1 Min. 30 Sek."?
browser_screenshot({ filename: "c10_delay_config.png", type: "png" })
```

### C11 — Vollstaendige Regel speichern (Frontend → Backend)

```
# Canvas aufraeumen — alles loeschen, dann saubere Regel bauen
# Ctrl+A → Delete (oder clearCanvas)

# Saubere Regel bauen:
# 1. Sensor-Node (DS18B20, ESP aus Block A, GPIO aus Block A, > 25)
# 2. Logic-Node (UND)
# 3. Actuator-Node (ESP, GPIO, ON)
# 4. Verbindungen: sensor → logic → actuator

# Regel-Name eingeben
browser_type({ ref: "RULE_NAME_INPUT_REF", text: "C11_Frontend_Test_Regel" })
browser_type({ ref: "RULE_DESC_INPUT_REF", text: "Via Frontend erstellt und gespeichert" })

# Speichern-Button klicken (oder Ctrl+S)
browser_click({ ref: "SAVE_BUTTON_REF", element: "Save button" })
browser_wait_for({ time: 2 })
browser_snapshot()
browser_network_requests({ includeStatic: false })
browser_console_messages({ level: "error" })
browser_screenshot({ filename: "c11_after_save.png", type: "png" })

# PRUEFEN:
# - Network-Request: POST /api/v1/logic/rules sichtbar?
# - Response: 201 Created?
# - URL aendert sich zu /logic/{ruleId} (Deep-Link)?
# - Keine JS-Errors?
# - Regel erscheint in der Regel-Liste (RuleCard)?
```

```bash
# Backend-Verifikation: Regel via API abrufen
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/logic/rules | \
  jq '.items[] // .[] | select(.name == "C11_Frontend_Test_Regel") | {id, name: .rule_name, enabled, logic_operator, conditions: .trigger_conditions, actions}'

# VERGLEICH:
# Frontend hat "sensor" als Condition-Type gespeichert?
# gpio + sensorType korrekt?
# PWM value korrekt konvertiert (0-100% → 0.0-1.0)?
# enabled: false (Default bei Frontend-Erstellung)?
```

### C12 — Gespeicherte Regel laden + editieren

```
# Zurueck zur Regel-Liste
browser_click({ ref: "BACK_BUTTON_REF", element: "Back button" })
browser_wait_for({ time: 1 })
browser_snapshot()

# RuleCard fuer "C11_Frontend_Test_Regel" finden und klicken
browser_click({ ref: "RULE_CARD_REF", element: "C11_Frontend_Test_Regel card" })
browser_wait_for({ time: 2 })
browser_snapshot()
browser_screenshot({ filename: "c12_rule_loaded.png", type: "png" })

# PRUEFEN:
# - Editor-Modus aktiv?
# - Nodes korrekt positioniert (links Conditions, mitte Logic, rechts Actions)?
# - Alle Verbindungen wiederhergestellt?
# - Sensor-Node zeigt korrekte Config (ESP, GPIO, Schwellwert)?
# - Config-Panel oeffnet sich bei Node-Klick?

# Node-Config editieren: Schwellwert von 25 auf 30 aendern
browser_click({ ref: "SENSOR_NODE_REF", element: "Sensor node" })
browser_snapshot()
browser_type({ ref: "VALUE_INPUT_REF", text: "30" })

# Speichern (Update, nicht Create)
browser_click({ ref: "SAVE_BUTTON_REF", element: "Save button" })
browser_wait_for({ time: 2 })
browser_network_requests({ includeStatic: false })
# PRUEFEN: PUT /api/v1/logic/rules/{ruleId} (nicht POST!)
```

### C13 — Toggle Enable/Disable im Frontend

```
# In der Regel-Liste: Status-Dot klicken zum Togglen
browser_click({ ref: "BACK_BUTTON_REF", element: "Back" })
browser_wait_for({ time: 1 })
browser_snapshot()

# RuleCard: Status-Dot (links) klicken → Toggle
browser_click({ ref: "STATUS_DOT_REF", element: "Toggle status dot" })
browser_wait_for({ time: 1 })
browser_snapshot()
browser_screenshot({ filename: "c13_after_toggle.png", type: "png" })

# PRUEFEN:
# - Network-Request: POST /api/v1/logic/rules/{id}/toggle
# - Status wechselt visuell: "Aktiv" ↔ "Deaktiviert"
# - Status-Dot Farbe aendert sich (gruen → grau)?
# - Pulse-Animation waehrend Toggle?
```

### C14 — Regel loeschen im Frontend

```
# RuleCard: Hover → Delete-Button erscheint
browser_hover({ ref: "RULE_CARD_REF", element: "Rule card" })
browser_snapshot()
browser_click({ ref: "DELETE_BUTTON_REF", element: "Delete button on rule card" })
browser_wait_for({ time: 1 })
browser_snapshot()

# PRUEFEN:
# - Bestaetigungsdialog? (ConfirmDialog?)
# - Network-Request: DELETE /api/v1/logic/rules/{id}
# - Regel verschwindet aus der Liste?
# - Execution-History auch geloescht? (CASCADE DELETE!)

browser_screenshot({ filename: "c14_after_delete.png", type: "png" })
```

### C15 — Undo/Redo im Editor

```
# Neue Regel erstellen, Nodes hinzufuegen
# Dann Ctrl+Z → letzter Node verschwindet
# Dann Ctrl+Y → Node kommt zurueck

browser_snapshot()
# Node hinzufuegen...
# Ctrl+Z
browser_press_key({ key: "Control+z" })
browser_snapshot()
browser_screenshot({ filename: "c15_after_undo.png", type: "png" })

# Ctrl+Y (Redo)
browser_press_key({ key: "Control+y" })
browser_snapshot()
browser_screenshot({ filename: "c15_after_redo.png", type: "png" })

# PRUEFEN:
# - Undo entfernt letzten Node/Edge?
# - Redo stellt ihn wieder her?
# - Max 50 Snapshots (history)
# - Toolbar zeigt Undo/Redo Buttons (disabled wenn nicht verfuegbar)?
```

### C16 — Node duplizieren + loeschen

```
# Node anklicken → Config-Panel Footer: Duplicate + Delete Buttons
browser_click({ ref: "SENSOR_NODE_REF", element: "Sensor node" })
browser_snapshot()

# Duplicate
browser_click({ ref: "DUPLICATE_BUTTON_REF", element: "Duplicate node button" })
browser_snapshot()
# → Neuer Node mit gleicher Config erscheint versetzt

# Delete
browser_click({ ref: "DELETE_NODE_BUTTON_REF", element: "Delete node button" })
browser_snapshot()
# → Node verschwindet, Config-Panel schliesst
browser_screenshot({ filename: "c16_node_operations.png", type: "png" })
```

### C17 — WebSocket Live-Execution Flash

```
# Regel aktiv im Editor → Sensor-Daten via MQTT injizieren → Flash-Animation pruefen
# Voraussetzung: Eine aktive Regel existiert die durch Sensor-Trigger feuert

# MQTT-Inject (aus anderem Terminal/Bash):
# docker exec automationone-mqtt mosquitto_pub -h localhost -p 1883 \
#   -t "kaiser/${ZONE}/esp/${ESP_ID}/sensor/${SENSOR_GPIO_TEMP}/data" \
#   -m '{"ts":..., "value": 28.0, ...}'

# Im Frontend beobachten:
browser_snapshot()
# PRUEFEN:
# - RuleCard: Flash-Animation (gruener Glow, 1.5s)?
# - Editor-Nodes: Flash bei Execution?
# - Execution-History Panel (unten): Neuer Eintrag erscheint?
browser_screenshot({ filename: "c17_live_execution_flash.png", type: "png" })
```

### C18 — Deep-Link URL Verifikation

```
# Regel-ID ermitteln (aus vorheriger Erstellung)
# Direkt per URL navigieren: /logic/{ruleId}
browser_navigate({ url: "http://localhost:5173/logic/RULE_ID_HIER" })
browser_wait_for({ time: 3 })
browser_snapshot()
browser_screenshot({ filename: "c18_deeplink.png", type: "png" })

# PRUEFEN:
# - Regel direkt im Editor geoeffnet?
# - Nodes korrekt geladen?
# - Breadcrumb zeigt Regel-Name?

# Ungueltige Rule-ID testen:
browser_navigate({ url: "http://localhost:5173/logic/nonexistent-uuid" })
browser_wait_for({ time: 2 })
browser_snapshot()
# PRUEFEN: Fehlerbehandlung? Redirect? Leerer Editor?
```

### C19 — Responsive-Test + Console-Check

```
# Desktop 1920x1080
browser_resize({ width: 1920, height: 1080 })
browser_screenshot({ filename: "c19_1920.png", type: "png" })

# Laptop 1280x800
browser_resize({ width: 1280, height: 800 })
browser_screenshot({ filename: "c19_1280.png", type: "png" })

# Tablet 1024x768
browser_resize({ width: 1024, height: 768 })
browser_screenshot({ filename: "c19_1024.png", type: "png" })

# Finale Console-Check
browser_console_messages({ level: "error" })
# → Keine unbehandelten JS-Errors?
browser_network_requests({ includeStatic: false })
# → Keine 4xx/5xx Requests?
```

### C — Checkliste

- [ ] **C1:** Login + Navigation zu `/logic` funktioniert
- [ ] **C2:** 6 Templates sichtbar mit korrekten Kategorien + Icons
- [ ] **C3:** Template-Verwendung laedt Nodes korrekt auf Canvas
- [ ] **C4:** ESP-Dropdown zeigt echte ESPs aus DB (`espStore.devices`)
- [ ] **C4:** Sensor-Dropdown filtert nach ESP (device-aware)
- [ ] **C4:** GPIO + sensorType werden automatisch gesetzt bei Auswahl
- [ ] **C4:** Between-Operator zeigt Min/Max-Felder
- [ ] **C5:** Actuator-Node: ESP → Aktor-Dropdown → Command → PWM-Slider
- [ ] **C5:** PWM-Wert-Konvertierung: Frontend 0-100% → Backend 0.0-1.0
- [ ] **C6:** Alle 14 Palette-Items lassen sich per Drag-and-Drop auf Canvas ziehen
- [ ] **C6:** Palette-Suchfunktion filtert Items korrekt
- [ ] **C7:** Gueltige Verbindungen: sensor → logic → actuator funktionieren
- [ ] **C7:** UNGUELTIGE Verbindungen sensor → actuator (direkt) BLOCKIERT
- [ ] **C7:** Self-loops BLOCKIERT
- [ ] **C8:** Time-Node: Start/End-Hour + Wochentag-Toggles konfigurierbar
- [ ] **C9:** Notification-Node: 3 Channels (websocket/email/webhook) + Template
- [ ] **C10:** Delay-Node: Sekunden-Input + menschenlesbare Anzeige
- [ ] **C11:** Speichern erstellt POST /logic/rules → 201 + URL-Update auf /logic/{id}
- [ ] **C12:** Gespeicherte Regel laden: Nodes + Edges korrekt rekonstruiert
- [ ] **C12:** Editieren + Speichern: PUT /logic/rules/{id}
- [ ] **C13:** Toggle Enable/Disable via Status-Dot in RuleCard
- [ ] **C14:** Loeschen via Delete-Button mit Bestaetigung
- [ ] **C15:** Undo (Ctrl+Z) / Redo (Ctrl+Y) funktioniert im Editor
- [ ] **C16:** Node-Duplizieren und Node-Loeschen im Config-Panel
- [ ] **C17:** WebSocket `logic_execution` → Flash-Animation auf RuleCard + Nodes
- [ ] **C18:** Deep-Link `/logic/{ruleId}` laedt Regel direkt
- [ ] **C18:** Ungueltige Rule-ID → Fehlerbehandlung (kein Crash)
- [ ] **C19:** Layout bei 1920/1280/1024 Breite funktional
- [ ] **C19:** Keine unbehandelten JS-Errors in Console
- [ ] **UX-Findings-Liste** fuer Block F erstellt

**Zeitschaetzung Block C:** 3-4 Stunden

---

## Block F: UX-Feinschliff + Layout-Korrektur (OPTIONAL)

**Ziel:** UX-Probleme aus Block C beheben. Nur ausfuehren wenn Zeit bleibt und Block D+G+E erfolgreich waren.

### F1 — Schriftgroessen und Lesbarkeit

```bash
# Schriftgroessen im Rule Builder finden
grep -r "font-size\|text-xs\|text-sm\|text-lg" \
  src/components/logic/ src/views/Logic* 2>/dev/null | head -20

# Empfehlung: Node-Labels >= 12px, Config-Labels 14px, Palette 13px
```

### F2 — Dynamisches Layout

```javascript
browser_resize({ width: 1920, height: 1080 })
browser_screenshot({ filename: "f02_desktop_1920.png" })
browser_resize({ width: 1280, height: 800 })
browser_screenshot({ filename: "f02_desktop_1280.png" })
browser_resize({ width: 1024, height: 768 })
browser_screenshot({ filename: "f02_tablet_1024.png" })
```

### F3 — Farb-Token-Konformitaet

```bash
# Hardcoded Hex-Farben im Logic-Bereich → durch CSS-Tokens ersetzen
grep -rE "#[0-9a-fA-F]{3,6}" src/components/logic/ 2>/dev/null | grep -v test | head -20
```

### F — Checkliste

- [ ] Schriftgroessen angepasst (falls noetig)
- [ ] Dynamisches Layout bei Resize getestet
- [ ] Hex-Farben durch Design-Tokens ersetzt
- [ ] `vue-tsc` nach Fixes: 0 Fehler
- [ ] Build nach Fixes: OK

**Zeitschaetzung Block F:** 2-3 Stunden (OPTIONAL)

---

## Block P: Persistenz, Navigation, Loeschen, Wiederherstellen (NEU 2026-03-02)

**Ziel:** Sicherstellen dass Regeln korrekt persistiert werden, Navigation fehlerfrei funktioniert, Loeschen + Zuruecknavigieren konsistent ist, und alle Frontend-Routen mit Backend-State synchron bleiben. Der Agent geht gezielt durch Szenarien die typische Persistenz-Bugs aufdecken: Erstellen → Verlassen → Zurueck → Noch da? Loeschen → Zurueck → Kein Crash? Mitten im Editieren Browser-Reload → State wiederhergestellt?

### P1 — Regel erstellen + Seite verlassen + zurueckkommen

```
# Schritt 1: Neue Regel erstellen und speichern
browser_navigate({ url: "http://localhost:5173/logic" })
browser_snapshot()
# → Neue Regel erstellen (Name: "P1_Persistenz_Test")
# → Sensor + Logic + Actuator Nodes konfigurieren
# → Speichern → POST /logic/rules → 201
# → URL ist jetzt /logic/{RULE_P1_ID}
browser_network_requests({ includeStatic: false })
# Rule-ID merken!

# Schritt 2: Komplett weg navigieren (Dashboard)
browser_navigate({ url: "http://localhost:5173/" })
browser_wait_for({ time: 2 })
browser_snapshot()

# Schritt 3: Zurueck zur Logic-Seite
browser_navigate({ url: "http://localhost:5173/logic" })
browser_wait_for({ time: 2 })
browser_snapshot()
browser_screenshot({ filename: "p01_back_to_logic.png", type: "png" })

# PRUEFEN:
# - RuleCard fuer "P1_Persistenz_Test" sichtbar?
# - Status korrekt (enabled/disabled)?
# - Execution-Count angezeigt?

# Schritt 4: Regel per RuleCard oeffnen
browser_click({ ref: "P1_RULE_CARD_REF", element: "P1_Persistenz_Test card" })
browser_wait_for({ time: 2 })
browser_snapshot()

# PRUEFEN:
# - Alle Nodes korrekt geladen (Position, Config, Verbindungen)?
# - Sensor-Node: ESP + GPIO + Schwellwert stimmen?
# - Logic-Node: AND/OR korrekt?
# - Actuator-Node: ESP + GPIO + Command stimmen?
# - Edges (Verbindungslinien) alle da?
browser_screenshot({ filename: "p01_rule_reloaded.png", type: "png" })
```

### P2 — Regel editieren + Browser-Reload (F5) mitten im Editieren

```
# Schritt 1: Regel P1 im Editor oeffnen
# URL ist /logic/{RULE_P1_ID}

# Schritt 2: Schwellwert aendern (25 → 35) aber NICHT speichern
browser_click({ ref: "SENSOR_NODE_REF", element: "Sensor node" })
browser_type({ ref: "VALUE_INPUT_REF", text: "35" })
browser_snapshot()

# Schritt 3: Browser-Reload (F5) OHNE zu speichern
browser_navigate({ url: "http://localhost:5173/logic/RULE_P1_ID" })
browser_wait_for({ time: 3 })
browser_snapshot()

# PRUEFEN:
# - Schwellwert ist wieder 25 (nicht 35!) → Unsaved Changes verworfen?
# - Warnung vor Datenverlust? (beforeunload Event?)
# - Oder: hasUnsavedChanges state → visueller Indikator?
browser_screenshot({ filename: "p02_after_reload.png", type: "png" })
```

### P3 — Regel loeschen + Deep-Link aufrufen

```
# Schritt 1: Regel P1 loeschen (via API oder Frontend)
```

```bash
# Via API loeschen
curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/rules/${RULE_P1_ID}"
echo "Regel P1 geloescht"

# Execution-History auch weg? (CASCADE DELETE)
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/execution_history?rule_id=${RULE_P1_ID}&limit=5" | jq '.'
```

```
# Schritt 2: Deep-Link zu geloeschter Regel aufrufen
browser_navigate({ url: "http://localhost:5173/logic/RULE_P1_ID" })
browser_wait_for({ time: 3 })
browser_snapshot()
browser_console_messages({ level: "error" })
browser_screenshot({ filename: "p03_deleted_deeplink.png", type: "png" })

# PRUEFEN:
# - KEIN Crash / White Screen?
# - Sinnvolle Fehlerbehandlung (Redirect zu /logic? Fehlermeldung?)
# - Keine unendlichen API-Retry-Loops?
# - Console-Errors unter Kontrolle?
```

### P4 — Mehrere Regeln erstellen + Reihenfolge + Paginierung

```bash
# 5 Regeln via API erstellen (schneller als UI)
for i in $(seq 1 5); do
  curl -sf -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    http://localhost:8000/api/v1/logic/rules \
    -d "{
      \"name\": \"P4_Regel_${i}\",
      \"enabled\": $([ $((i % 2)) -eq 0 ] && echo true || echo false),
      \"logic_operator\": \"AND\",
      \"priority\": $((i * 10)),
      \"conditions\": [{\"type\": \"sensor\", \"esp_id\": \"${ESP_ID}\", \"gpio\": ${SENSOR_GPIO_TEMP}, \"operator\": \">\", \"value\": $((20 + i))}],
      \"actions\": [{\"type\": \"notification\", \"channel\": \"websocket\", \"message_template\": \"P4 Regel ${i}\"}]
    }" > /dev/null
done
echo "5 Regeln erstellt"
```

```
# Frontend pruefen
browser_navigate({ url: "http://localhost:5173/logic" })
browser_wait_for({ time: 2 })
browser_snapshot()
browser_screenshot({ filename: "p04_multiple_rules.png", type: "png" })

# PRUEFEN:
# - Alle 5 Regeln als RuleCards sichtbar?
# - Status-Dots korrekt (2,4 enabled/gruen, 1,3,5 disabled/grau)?
# - Reihenfolge konsistent (nach Erstellung oder alphabetisch)?

# Zwischen Regeln hin-und-her klicken (schnell)
browser_click({ ref: "P4_REGEL_1_REF", element: "P4_Regel_1" })
browser_wait_for({ time: 1 })
browser_click({ ref: "BACK_BUTTON_REF", element: "Back" })
browser_click({ ref: "P4_REGEL_3_REF", element: "P4_Regel_3" })
browser_wait_for({ time: 1 })
browser_click({ ref: "BACK_BUTTON_REF", element: "Back" })
browser_click({ ref: "P4_REGEL_5_REF", element: "P4_Regel_5" })
browser_wait_for({ time: 1 })
browser_snapshot()

# PRUEFEN:
# - Keine Race-Conditions?
# - Jede Regel laedt korrekt?
# - Kein State-Bleed zwischen Regeln?
```

### P5 — Mitten im Loeschen: Regel loeschen waehrend sie im Editor offen ist

```
# Regel P4_Regel_3 im Editor oeffnen
browser_click({ ref: "BACK_BUTTON_REF", element: "Back" })
browser_click({ ref: "P4_REGEL_3_REF", element: "P4_Regel_3" })
browser_wait_for({ time: 2 })
browser_snapshot()

# Jetzt: In der Toolbar den Delete-Button klicken
browser_click({ ref: "TOOLBAR_DELETE_REF", element: "Delete button in toolbar" })
browser_wait_for({ time: 2 })
browser_snapshot()
browser_screenshot({ filename: "p05_delete_while_editing.png", type: "png" })

# PRUEFEN:
# - Bestaetigungsdialog?
# - Nach Loeschung: Redirect zu /logic (Liste)?
# - Kein leerer/kaputter Editor-State?
# - Console-Errors?
browser_console_messages({ level: "error" })
```

### P6 — API-Backend Konsistenz nach Frontend-Operationen

```bash
# Alle noch existierenden Regeln via API abfragen
echo "=== Verbleibende Regeln ==="
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/logic/rules | jq '[.items[]? // .[] | {id, name: (.rule_name // .name), enabled}]'

# Execution-History: Keine verwaisten Eintraege (CASCADE DELETE)
echo "=== Execution-History gesamt ==="
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/logic/execution_history?limit=50" | jq '{total, items: [.items[] | {rule_id, success}]}'

# DB-Konsistenz pruefen: Keine orphaned execution_history
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT COUNT(*) as orphaned FROM logic_execution_history leh
   LEFT JOIN cross_esp_logic cel ON leh.logic_rule_id = cel.id
   WHERE cel.id IS NULL;"

# Aufraeumen: Alle P4-Regeln loeschen
curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/logic/rules | \
  jq -r '.items[]? // .[] | select(.name // .rule_name | test("^P[0-9]")) | .id' | \
  while read id; do
    curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" \
      "http://localhost:8000/api/v1/logic/rules/$id" > /dev/null
  done
echo "P-Test-Regeln bereinigt"
```

### P — Checkliste

- [ ] **P1:** Regel erstellen → wegnavigieren → zurueck → Regel ist da, Config korrekt
- [ ] **P1:** Nodes, Edges, Config werden aus DB korrekt rekonstruiert (ruleToGraph)
- [ ] **P2:** Browser-Reload verwirft unsaved Changes (Schwellwert zurueckgesetzt)
- [ ] **P2:** hasUnsavedChanges Indikator im UI? (oder beforeunload Warnung?)
- [ ] **P3:** Deep-Link zu geloeschter Regel → kein Crash, sinnvolle Fehlerbehandlung
- [ ] **P3:** CASCADE DELETE: Execution-History mit Regel geloescht
- [ ] **P4:** Mehrere Regeln: RuleCards korrekt, Status-Dots korrekt
- [ ] **P4:** Schnelles Hin-und-Her zwischen Regeln: kein State-Bleed
- [ ] **P5:** Loeschen waehrend Editieren: sauberer Redirect zu /logic
- [ ] **P6:** DB-Konsistenz: Keine orphaned execution_history Eintraege
- [ ] **P6:** API-State == Frontend-State (keine Divergenz)

**Zeitschaetzung Block P:** 2 Stunden

---

## Block H: Report + Fix-Dokumentation

**Ziel:** Alle Erkenntnisse strukturiert dokumentieren. PFLICHT — wird als letztes gemacht, aber darf nicht uebersprungen werden.

### H1 — Report erstellen

Report nach `.claude/reports/current/LOGIC_ENGINE_VOLLTEST.md` schreiben:

```markdown
# Logic Engine Volltest — Report
**Datum:** YYYY-MM-DD
**Branch:** feature/logic-engine-volltest

## System-Bestandsaufnahme (Block A)
- Wokwi-ESP: [ESP_ID], Zone: [ZONE]
- Sensor-GPIOs: DS18B20=[GPIO], Bodenfeuchte=[GPIO]
- Sensor-Type-Name: [soil_moisture / moisture]
- Aktor: [ID, Typ, GPIO]
- GPIO-Wiring-Status: [MATCH / MISMATCH + Fix]

## Logic Engine API (Block D0)
- Condition-Typen: sensor/sensor_threshold, time_window/time, compound, hysteresis
- Action-Typen: actuator/actuator_command, notification, delay, sequence
- Safety-System: ConflictManager [JA/NEIN], RateLimiter [JA/NEIN], LoopDetector [JA/NEIN]
- WebSocket Event-Name: logic_execution
- API-Response-Format: [.items[] paginiert / direkt Array]

## E2E-Szenarien Backend (Block D)
| Szenario | Status | Problem / Fix |
|----------|--------|---------------|
| D1: Schwellwert (Gate-Keeper) | [OK/FAIL] | |
| D2: AND-Logik | [OK/FAIL] | |
| D3: OR-Logik | [OK/FAIL] | |
| D4: Multi-Regel parallel | [OK/FAIL] | |
| D5: Delay/Cooldown | [OK/FAIL/N/A] | |
| D6: ConflictManager | [OK/FAIL] | |
| D6: RateLimiter | [OK/FAIL] | |
| D8: Hysterese | [OK/FAIL/N/A] | |
| D9: Zeitfenster (Timer) | [OK/FAIL] | |
| D9c: Zeit + Sensor (AND) | [OK/FAIL] | |
| D10: Compound-Conditions | [OK/FAIL/N/A] | |
| D11: Sequence-Action | [OK/FAIL/N/A] | |
| D12: Test/Dry-Run | [OK/FAIL] | |
| D13: Toggle + History | [OK/FAIL] | |
| D14: Cross-Sensor (DB-Lookup) | [OK/FAIL] | |
| D15: Priority + Cooldown | [OK/FAIL] | |

## Aktor-Verifikation (Block G)
- E2E-Loop: [FUNKTIONIERT / NICHT]
- Wokwi reagiert sichtbar: [JA / NEIN / NICHT VERIFIZIERBAR]

## Error-Handling (Block E)
| Test | HTTP-Code | Erwartet | OK? |
|------|-----------|----------|-----|
| Nicht-existenter ESP | [Code] | 400/422 | |
| Nicht-existenter Aktor | [Code] | 400/422 | |
| Leere Regel | [Code] | 400/422 | |
| NaN/null Sensor | [Verhalten] | kein Fire | |
| Out-of-Range 1000°C | [Verhalten] | Range-Check | |
| ESP offline | [Verhalten] | Graceful | |
| 10-Regeln-Performance | [ms] | < 500ms | |

## Frontend Rule Builder (Block C)
| Feature | Status | Problem / Fix |
|---------|--------|---------------|
| C1: Login + Navigation | [OK/FAIL] | |
| C2: 6 Templates | [OK/FAIL] | |
| C3: Template verwenden | [OK/FAIL] | |
| C4: ESP/Sensor-Dropdown (device-aware) | [OK/FAIL] | |
| C5: Actuator-Config + PWM | [OK/FAIL] | |
| C6: 14 Palette-Items Drag-and-Drop | [OK/FAIL] | |
| C7: Connection Validation | [OK/FAIL] | |
| C8: Time-Node Config | [OK/FAIL] | |
| C9: Notification-Node Config | [OK/FAIL] | |
| C10: Delay-Node Config | [OK/FAIL] | |
| C11: Save (POST) | [OK/FAIL] | |
| C12: Load + Edit (PUT) | [OK/FAIL] | |
| C13: Toggle Enable/Disable | [OK/FAIL] | |
| C14: Delete | [OK/FAIL] | |
| C15: Undo/Redo | [OK/FAIL] | |
| C16: Node Duplicate/Delete | [OK/FAIL] | |
| C17: WS Live-Flash | [OK/FAIL] | |
| C18: Deep-Link | [OK/FAIL] | |
| C19: Responsive | [OK/FAIL] | |

## Persistenz (Block P)
| Test | Status | Problem / Fix |
|------|--------|---------------|
| P1: Navigieren + Zurueck | [OK/FAIL] | |
| P2: Browser-Reload unsaved | [OK/FAIL] | |
| P3: Deep-Link geloeschte Regel | [OK/FAIL] | |
| P4: Schnelles Hin-und-Her | [OK/FAIL] | |
| P5: Loeschen waehrend Editieren | [OK/FAIL] | |
| P6: DB-Konsistenz (orphaned) | [OK/FAIL] | |

## Timing-Beobachtungen
- Sensor→Logic→Aktor Latenz: [ms] (Trigger bis MQTT-Command)
- LogicScheduler Intervall: [s] (gemessen)
- Cooldown-Praezision: [s Abweichung]
- Cross-Sensor DB-Lookup: [ms]

## Direkt-Fixes
| # | Datei | Fix | Commit |
|---|-------|-----|--------|

## Offene Bugs
| ID | Schweregrad | Beschreibung |
|----|-------------|--------------|

## Empfehlungen
1. ...
```

### H2 — Commit + Branch pushen

```bash
git add -A
git status
git commit -m "feat(logic-engine): volltest — regeln anlegen, e2e-verifikation, fixes

Block A: Wokwi-Wiring verifiziert, GPIO-Match bestaetigt
Block D: N Szenarien (AND/OR/Multi/Safety), M Fixes
Block G: Aktor-E2E-Loop verifiziert
Block E: Error-Handling dokumentiert
Block C: Frontend Rule Builder geprueft

Direkte Fixes: X Commits
Offene Bugs: Y (CRITICAL: Z)"
```

**Zeitschaetzung Block H:** 30 Minuten

---

## Gesamtcheckliste

### Vor dem Start
- [ ] Docker-Stack laeuft: `docker compose --profile monitoring up -d`
- [ ] Wokwi-Simulation laeuft
- [ ] Branch: `git checkout -b feature/logic-engine-volltest`
- [ ] Playwright MCP Server in `.mcp.json`
- [ ] Frontend erreichbar: `http://localhost:5173`
- [ ] Server erreichbar: `http://localhost:8000/api/v1/health/live`

### Go/No-Go nach Block A
- [ ] Wokwi-ESP aktiv (Heartbeats < 10min)
- [ ] GPIO-Wiring: Diagramm == DB-Config (KEIN MISMATCH)
- [ ] Sensor-Daten fliessen
- [ ] Alle Shell-Variablen gesetzt: `$TOKEN`, `$ESP_ID`, `$ZONE`, `$SENSOR_GPIO_TEMP`, `$SENSOR_GPIO_SOIL`, `$AKTOR_GPIO`, `$AKTOR_ID`

### Kern-Ergebnis nach Block D
- [ ] **D1-D6:** Basis-Szenarien (Schwellwert, AND, OR, Multi, Delay, Safety)
- [ ] **D8:** Hysterese (Flapping-Schutz verifiziert)
- [ ] **D9:** Zeitfenster (aktiv/inaktiv korrekt)
- [ ] **D10:** Compound-Conditions (verschachtelte Logik)
- [ ] **D11:** Sequence-Actions (mehrstufig)
- [ ] **D12:** Test/Dry-Run (Mock-Werte, kein Aktor geschaltet)
- [ ] **D13:** Toggle + Execution-History
- [ ] **D14:** Cross-Sensor (DB-Lookup fuer fehlende Werte)
- [ ] **D15:** Priority + Cooldown + Rate-Limit
- [ ] MQTT-Commands auf Broker sichtbar wenn Regeln feuern
- [ ] Logic-Evaluation in Server-Logs sichtbar

### Kern-Ergebnis nach Block C
- [ ] Frontend Rule Builder: Alle 14 Palette-Items funktionieren
- [ ] ESP/Sensor/Aktor-Auswahl: Echte Geraete aus DB
- [ ] Connection-Validation: Direkte sensor→actuator BLOCKIERT
- [ ] Speichern/Laden/Editieren/Loeschen/Toggle funktioniert
- [ ] WebSocket Live-Execution Flash sichtbar
- [ ] Deep-Links funktionieren

### Kern-Ergebnis nach Block P
- [ ] Persistenz: Regel ueberlebt Navigation + Reload
- [ ] Loeschen: CASCADE DELETE (History auch weg), kein Crash bei Deep-Link
- [ ] Konsistenz: API-State == Frontend-State

### Quality Gate vor Commit
- [ ] Keine neuen Test-Failures eingefuehrt
- [ ] Alle Test-Regeln bereinigt (keine D*/E*/P*-Regeln in DB)
- [ ] Report vollstaendig (.claude/reports/current/LOGIC_ENGINE_VOLLTEST.md)

---

## Offene Fragen (vom Agenten in Block A/D0 zu beantworten)

1. **Wokwi-ESP-IDs:** Welche ESP-IDs, welche Zone?
2. **Sensor-GPIOs:** DS18B20 auf welchem GPIO, Bodenfeuchte auf welchem?
3. **Sensor-Type-Name:** `soil_moisture` oder `moisture`? (Palette nutzt `moisture`, Backend beides)
4. **Aktor-Typ:** LED, Relay, Pumpe? Aktor-GPIO?
5. **Logic-API-Pfad:** Verifiziert als `/api/v1/logic/rules` — aber Response-Format? (`.items[]` oder direkt `[]`?)
6. **Condition-Schema:** Type `"sensor"` oder `"sensor_threshold"`? Beide akzeptiert — welches nutzt das Frontend?
7. **WebSocket-Eventname:** Verifiziert als `logic_execution`
8. **Auto-Off:** Schaltet Aktor automatisch AUS wenn Schwellwert nicht mehr gilt? Oder bleibt ON?
9. **LogicScheduler-Intervall:** Default 60s — wie konfiguriert? (`settings.performance.logic_scheduler_interval_seconds`)
10. **Hysterese-State:** In-Memory (verloren bei Server-Restart) — akzeptabel?

---

## Zeitplan (2-3 Sessions)

**Session 1 (~7-8h):** Block A + Block D (D0-D15) + Block G
- Ziel: Wiring verifiziert, ALLE Logic-Szenarien getestet, Aktoren reagieren E2E

**Session 2 (~5-6h):** Block E + Block C (C1-C19)
- Ziel: Error-Handling, Frontend Rule Builder komplett durchgeklickt

**Session 3 (~3-4h):** Block P + Block F (optional) + Block H
- Ziel: Persistenz verifiziert, UX-Fixes, Report

**Gesamt:** 14-18 Stunden

---

## Anhang: Verifizierte Datei-Pfade (Codebase-Analyse 2026-03-02)

| Was | Pfad (relativ zu `El Servador/god_kaiser_server/`) |
|-----|-----|
| Logic Router | `src/api/v1/logic.py` |
| Sequence Router | `src/api/v1/sequences.py` |
| DB Models | `src/db/models/logic.py` |
| Pydantic Validation | `src/db/models/logic_validation.py` |
| API Schemas | `src/schemas/logic.py` |
| Repository | `src/db/repositories/logic_repo.py` |
| Logic Engine (Core) | `src/services/logic_engine.py` |
| Logic Service (CRUD) | `src/services/logic_service.py` |
| Logic Scheduler | `src/services/logic_scheduler.py` |
| Validator | `src/services/logic/validator.py` |
| Sensor Evaluator | `src/services/logic/conditions/sensor_evaluator.py` |
| Time Evaluator | `src/services/logic/conditions/time_evaluator.py` |
| Compound Evaluator | `src/services/logic/conditions/compound_evaluator.py` |
| Hysteresis Evaluator | `src/services/logic/conditions/hysteresis_evaluator.py` |
| Actuator Executor | `src/services/logic/actions/actuator_executor.py` |
| Notification Executor | `src/services/logic/actions/notification_executor.py` |
| Delay Executor | `src/services/logic/actions/delay_executor.py` |
| Sequence Executor | `src/services/logic/actions/sequence_executor.py` |
| ConflictManager | `src/services/logic/safety/conflict_manager.py` |
| RateLimiter | `src/services/logic/safety/rate_limiter.py` |
| LoopDetector | `src/services/logic/safety/loop_detector.py` |
| MQTT Trigger | `src/mqtt/handlers/sensor_handler.py` (Zeile ~415) |

| Was | Pfad (relativ zu `El Frontend/`) |
|-----|-----|
| LogicView | `src/views/LogicView.vue` |
| RuleFlowEditor | `src/components/rules/RuleFlowEditor.vue` |
| RuleNodePalette | `src/components/rules/RuleNodePalette.vue` |
| RuleConfigPanel | `src/components/rules/RuleConfigPanel.vue` |
| RuleCard | `src/components/rules/RuleCard.vue` |
| RuleTemplateCard | `src/components/rules/RuleTemplateCard.vue` |
| Logic Store | `src/shared/stores/logic.store.ts` |
| Logic API | `src/api/logic.ts` |
| Rule Templates | `src/config/rule-templates.ts` |
| Router | `src/router/index.ts` (Routes: `/logic`, `/logic/:ruleId`) |
