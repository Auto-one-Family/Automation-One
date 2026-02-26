# Auftrag: Chaos Engineering + Mock-Volltest — Kontinuierlicher System-Test mit Fix-on-the-fly

**Ziel-Repo:** auto-one
**Kontext:** AutomationOne ist technisch weitgehend fertig (Backend 95%, Frontend 93%, Firmware 90%). Es fehlt eine systematische, kontinuierliche Verifikation ob alle Teile korrekt zusammenspielen. Dieser Auftrag gibt einem Agenten VOLLEN ZUGRIFF um das gesamte System online und in Betrieb zu testen — ueber den Mock-Server, Frontend, API, DB und Monitoring. Gefundene Probleme werden DIREKT gefixt.
**Bezug:** Phase 2 Produktionstestfeld (phasenplan-testinfrastruktur.md), Pre-Hardware-Testlauf-Verifikation
**Prioritaet:** HOCH — kontinuierlicher Prozess, kein einmaliger Test
**Datum:** 2026-02-26
**Branch:** `feature/chaos-mock-volltest` (fuer Fixes), Tests laufen auf laufendem Stack
**Verify-Plan:** 2026-02-27 — 7 kritische Korrekturen direkt eingefuegt (siehe unten)

---

## /verify-plan Korrekturen (2026-02-27)

> Alle folgenden Fehler wurden direkt im Dokument korrigiert. Diese Sektion dokumentiert was geaendert wurde.

| # | Kategorie | Fehler im Original | Korrektur | Betroffene Bloecke |
|---|-----------|-------------------|-----------|-------------------|
| 1 | **Docker Container** | `automationone-mqtt-broker` | `automationone-mqtt` | A, C, F (40+ Stellen) |
| 2 | **DB Tabellen-Name** | `esps` (SQL) | `esp_devices` | A4, C2, E3-E4, F5 |
| 3 | **DB Spalten-Name** | `esp_id` in esp_devices-Queries | `device_id` (String-Identifier) | A4, C2, E4, F5 |
| 4 | **DB Spalte** | `is_approved` (existiert nicht) | `approved_at IS NOT NULL` + Status-Enum | A4, E3 |
| 5 | **DB Spalte** | `sensor_data.value` | `sensor_data.processed_value` (UUID FK → JOIN noetig) | C3, C4, F2, F4 |
| 6 | **MQTT Topic** | `system/lwt` | `system/will` | Vorbemerkungen, C2.3, F5 |
| 7 | **API Endpoint** | `GET/POST/DELETE /api/v1/zones` | Zone-API ist ESP-fokussiert: `/api/v1/zone/devices/{esp_id}/assign` etc. | B5 |
| 8 | **WebSocket** | `ws://localhost:8000/ws` | `ws://localhost:8000/api/v1/ws/realtime/{client_id}?token=...` | B9 |
| 9 | **Health Response** | `jq '{status, db: .database, mqtt: .mqtt}'` | `jq '{status, mqtt: .mqtt_connected}'` + `/api/v1/health/detailed` | A1 |
| 10 | **Handler Count** | "12 MQTT-Handler" | 15 (12 Core + 3 Mock-ESP) | Ist-Zustand, C |
| 11 | **Sensor Config API** | `GET /api/v1/sensors?esp_id=...` | Path-Parameter: `GET /api/v1/sensors/{esp_id}/{gpio}` | B4 |
| 12 | **Frontend Views** | 16 Views gelistet | 17 Views (+ SetupView.vue, /dashboard-legacy = Redirect) | D |

### Offene Hinweise (NICHT im Plan korrigiert — Agent muss beachten):

1. **sensor_data.esp_id ist UUID** — KEIN String. Alle SQL-Queries auf sensor_data muessen per JOIN ueber esp_devices gehen (`sd.esp_id = ed.id WHERE ed.device_id='MOCK_CHAOS01'`). Die korrigierten Queries oben zeigen das Pattern.
2. **Prometheus Broker-Metriken**: Plan referenziert `mqtt_broker_clients_connected` — pruefen ob diese Metrik von Alloy/Exporter bereitgestellt wird oder ob nur `god_kaiser_mqtt_*` existiert.
3. **Logic Rule Payload**: Die LogicRuleCreate Schema-Struktur (conditions/actions Format) sollte gegen das Pydantic-Schema in `schemas/logic.py` validiert werden bevor Block B6 ausgefuehrt wird.
4. **Navigation Guard**: `/setup` und `/login` redirecten zu `/hardware` wenn User bereits eingeloggt. Test-Skript muss das beruecksichtigen.
5. **Zone-Konzept**: Zonen sind KEINE unabhaengigen Entitaeten — sie existieren nur als Properties von ESP-Devices (zone_id, zone_name). Es gibt keine Zone-Tabelle.

---

## Wichtige Vorbemerkungen fuer den Agenten

### Mock-Server als Testbasis

Der Mock-ESP-Server simuliert einen echten ESP32. Im System ist MOCK_0954B2B1 der aktive Mock. Fuer diesen Auftrag NEUEN Mock erstellen:

```bash
# Neuen Test-Mock erstellen (kein MOCK_ Prefix-Problem — Regex: ^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+)$)
export TEST_MOCK_ID="MOCK_CHAOS01"
export TEST_MOCK_ZONE="god"
```

**Korrekte MQTT-Topics (aus Trockentest 2026-02-25 verifiziert):**
```
Heartbeat:     kaiser/{zone}/esp/{esp_id}/system/heartbeat
Sensor-Data:   kaiser/{zone}/esp/{esp_id}/sensor/{gpio}/data
Config-Resp:   kaiser/{zone}/esp/{esp_id}/config_response
LWT (Will):    kaiser/{zone}/esp/{esp_id}/system/will
Commands:      kaiser/{zone}/esp/{esp_id}/actuator/{id}/command
```

**Korrekte Payload-Formate:**
```json
// Heartbeat:
{"ts": 1740000000, "uptime": 1000, "heap_free": 200000, "wifi_rssi": -45}

// Sensor-Data (Single-Value):
{"ts": 1740000000, "esp_id": "MOCK_CHAOS01", "gpio": 21, "sensor_type": "sht31_temp", "raw": 2250, "raw_mode": false, "value": 22.5, "unit": "C", "quality": "good"}

// Sensor-Data (Multi-Value SHT31 — nach Multi-Value-Splitting):
{"ts": 1740000000, "esp_id": "MOCK_CHAOS01", "gpio": 21, "sensor_type": "sht31_humidity", "raw": 5500, "raw_mode": false, "value": 55.0, "unit": "%RH", "quality": "good"}
```

**Prometheus-Metrics-Prefix:** `god_kaiser_*` (NICHT `automationone_*`)

**Auth-Flow:**
```bash
# Login:
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "admin", "password": "Admin123#"}'
# Token liegt unter: response["tokens"]["access_token"]
```

### KI-Rollentrennung beachten

Dieser Auftrag ist ROLLE 1 (Executor) + ROLLE 3 (Fixer). Kleine direkte Fixes committen. Groessere Probleme als Sub-Auftrag dokumentieren. KEIN automatisches Deployment nach master — Fixes gehen auf `feature/chaos-mock-volltest`.

---

## Ist-Zustand

| Schicht | Stand | Testlauf-Readiness |
|---------|-------|-------------------|
| Backend (El Servador) | 95% | ~170 Endpoints, 15 MQTT-Handler (12 Core + 3 Mock), 9 Sensor-Libraries |
| Frontend (El Frontend) | 93% | 16+ Views, 97 Komponenten, 14 Pinia Stores, 28 WS-Events |
| Firmware (El Trabajante) | 90% | Laeuft als Mock-Simulation |
| Monitoring | 100% | 38/38 Grafana-Alerts, Alloy, Loki, Prometheus |
| Tests | 278 Szenarien | 8/8 CI-Pipelines gruen |

**Bekannte Probleme die NOCH NICHT gefixt sind:**
- DnD Sensor/Aktor Drop: 2 kritische Bugs (Payload-Verlust beim Modal-Uebergang, addActuator Mock-Only) → `auftrag-dnd-sensor-aktor-drop-fix.md`
- Trockentest-Bugs Block B+C: Sensor-Data API 500 (Medium), Range-Validierung (Low) → `auftrag-trockentest-fix.md`
- Dashboard-Persistenz Backend: Endpoint fehlt noch
- ESPOrbitalLayout.vue: 633 Zeilen, weiterer Split optional

**Stack-Voraussetzung:** Docker-Stack muss laufen mit `docker compose --profile monitoring up -d`

---

## Uebersicht der Bloecke

| Block | Thema | Prioritaet | Aufwand | Fix-Kompetenz |
|-------|-------|------------|---------|---------------|
| **A** | Mock-Server-Infrastruktur aufbauen | KRITISCH | 30-45 Min | Ja — direkt umsetzen |
| **B** | Server/API Komplett-Test | KRITISCH | 2-3h | Ja — direkte Fixes |
| **C** | MQTT-Pipeline End-to-End | HOCH | 1-2h | Ja — direkte Fixes |
| **D** | Frontend Komplett-Test | HOCH | 3-4h | Ja — kleine Fixes direkt |
| **E** | Datenbank-Konsistenz | HOCH | 1h | Ja — SQL direkt |
| **F** | Chaos-Szenarien (Fehler-Injektion) | MITTEL | 2h | Teilweise |
| **G** | UX-Qualitaets-Audit | MITTEL | 2-3h | Kleine Fixes direkt |
| **H-J** | Platzhalter (Erweiterungen) | OFFEN | TBD | TBD |

**REIHENFOLGE:** A → B → C → D → E → F → G → dann H-J nach Bedarf

---

## Block A: Mock-Server-Infrastruktur aufbauen

**Ziel:** Stabiler, kontrollierter Mock-ESP der alle MQTT-Topics bespielt und als Testbasis fuer alle weiteren Bloecke dient.

### A1 — Test-Mock erstellen und approven

```bash
# Schritt 1: Stack-Check
# /health gibt {status: "healthy"|"degraded", mqtt_connected: bool} zurueck
curl -sf http://localhost:8000/health | jq '{status: .status, mqtt: .mqtt_connected}'
# Fuer detaillierten Health-Check (DB, MQTT, WebSocket, System):
curl -sf http://localhost:8000/api/v1/health/detailed | jq '{status: .status, components: .components}'

# Schritt 2: Login + Token holen
TOKEN=$(curl -sf -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "admin", "password": "Admin123#"}' | jq -r '.tokens.access_token')
echo "Token: ${TOKEN:0:20}..."

# Schritt 3: Mock via Heartbeat registrieren
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/system/heartbeat" \
  -m "{\"ts\":$(date +%s),\"uptime\":1000,\"heap_free\":200000,\"wifi_rssi\":-45}"

sleep 5

# Schritt 4: Mock approven (korrekte URL aus Trockentest)
curl -sf -X POST http://localhost:8000/api/v1/esp/devices/MOCK_CHAOS01/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### A2 — Realistischen Heartbeat-Loop starten

```bash
# Kontinuierlicher Heartbeat alle 30s im Hintergrund
# Erstelle temporaeres Script:
cat > /tmp/mock_heartbeat.sh << 'EOF'
#!/bin/bash
MOCK_ID="MOCK_CHAOS01"
ZONE="god"
TOPIC="kaiser/${ZONE}/esp/${MOCK_ID}/system/heartbeat"
COUNT=0
while true; do
  COUNT=$((COUNT + 1))
  docker exec automationone-mqtt mosquitto_pub \
    -h localhost -p 1883 \
    -t "$TOPIC" \
    -m "{\"ts\":$(date +%s),\"uptime\":$((COUNT * 30000)),\"heap_free\":$((200000 - RANDOM % 10000)),\"wifi_rssi\":-$((40 + RANDOM % 15))}"
  sleep 30
done
EOF
chmod +x /tmp/mock_heartbeat.sh
# Start im Hintergrund: /tmp/mock_heartbeat.sh &
# PID merken: HEARTBEAT_PID=$!
```

### A3 — Sensordaten-Generierung starten

Realistische Temperatur (18-30°C) und Luftfeuchtigkeit (40-80% RH) mit natuerlicher Fluktuation:

```bash
cat > /tmp/mock_sensors.sh << 'EOF'
#!/bin/bash
MOCK_ID="MOCK_CHAOS01"
ZONE="god"
BASE_TEMP=22
BASE_HUMID=55
COUNT=0

while true; do
  COUNT=$((COUNT + 1))
  TS=$(date +%s)

  # Natuerliche Fluktuation (+/- 2°C, +/- 5% RH)
  TEMP_DELTA=$(python3 -c "import random; print(round(random.uniform(-2,2),1))")
  HUMID_DELTA=$(python3 -c "import random; print(round(random.uniform(-5,5),1))")
  TEMP=$(python3 -c "print(round(${BASE_TEMP} + ${TEMP_DELTA}, 1))")
  HUMID=$(python3 -c "print(min(100, max(0, round(${BASE_HUMID} + ${HUMID_DELTA}, 1))))")

  # SHT31 Temperatur
  docker exec automationone-mqtt mosquitto_pub \
    -h localhost -p 1883 \
    -t "kaiser/${ZONE}/esp/${MOCK_ID}/sensor/21/data" \
    -m "{\"ts\":${TS},\"esp_id\":\"${MOCK_ID}\",\"gpio\":21,\"sensor_type\":\"sht31_temp\",\"raw\":$(python3 -c "print(int(${TEMP}*100))"),\"raw_mode\":false,\"value\":${TEMP},\"unit\":\"C\",\"quality\":\"good\"}"

  sleep 1

  # SHT31 Luftfeuchtigkeit
  docker exec automationone-mqtt mosquitto_pub \
    -h localhost -p 1883 \
    -t "kaiser/${ZONE}/esp/${MOCK_ID}/sensor/21/data" \
    -m "{\"ts\":${TS},\"esp_id\":\"${MOCK_ID}\",\"gpio\":21,\"sensor_type\":\"sht31_humidity\",\"raw\":$(python3 -c "print(int(${HUMID}*100))"),\"raw_mode\":false,\"value\":${HUMID},\"unit\":\"%RH\",\"quality\":\"good\"}"

  sleep 29  # Total: 30s Intervall
done
EOF
chmod +x /tmp/mock_sensors.sh
```

### A4 — Baseline verifizieren

```bash
# Mock in DB?
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT device_id, status, approved_at, last_seen FROM esp_devices WHERE device_id='MOCK_CHAOS01';"

# Sensor-Daten fliessen?
# HINWEIS: sensor_data.esp_id ist UUID FK → JOIN mit esp_devices noetig
sleep 35
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT sd.sensor_type, COUNT(*) as readings, MAX(sd.timestamp) as last
   FROM sensor_data sd
   JOIN esp_devices ed ON sd.esp_id = ed.id
   WHERE ed.device_id='MOCK_CHAOS01'
   GROUP BY sd.sensor_type;"

# Prometheus-Metriken?
curl -sf "http://localhost:9090/api/v1/query?query=god_kaiser_sensor_value" | \
  jq '.data.result | length'
```

### A4 Checkliste

- [ ] MOCK_CHAOS01 in DB (status: online, approved_at NOT NULL)
- [ ] Heartbeat kommt per MQTT alle 30s
- [ ] Sensor-Daten fliessen (sht31_temp + sht31_humidity)
- [ ] Prometheus hat Metriken (god_kaiser_sensor_value > 0)
- [ ] Grafana Heartbeat-Gap-Alert NICHT feuert fuer MOCK_CHAOS01

**Zeitschaetzung Block A:** 30-45 Minuten

---

## Block B: Server/API Komplett-Test

**Ziel:** Alle ~170 REST-Endpoints systematisch pruefen. Fehler finden und direkt fixen.

### B1 — API-Inventar erstellen

```bash
# Alle Endpoints auflisten
curl -sf http://localhost:8000/openapi.json | jq '[.paths | to_entries[] | {path: .key, methods: (.value | keys)}]' | head -100

# Endpoint-Count pro Kategorie
curl -sf http://localhost:8000/openapi.json | jq '[.paths | to_entries[].key | split("/")[3]] | group_by(.) | map({category: .[0], count: length}) | sort_by(-.count)'
```

### B2 — Health + Auth Endpoints

```bash
# Health
curl -sf http://localhost:8000/health | jq .
curl -sf http://localhost:8000/api/v1/health | jq . 2>/dev/null || echo "kein /api/v1/health"

# Auth: Login
RESPONSE=$(curl -sf -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "admin", "password": "Admin123#"}')
echo "Login Response Keys: $(echo $RESPONSE | jq 'keys')"
TOKEN=$(echo $RESPONSE | jq -r '.tokens.access_token')

# Auth: Token-Refresh
curl -sf -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Authorization: Bearer $TOKEN" | jq '{status: "ok", has_token: (.tokens.access_token != null)}'

# Auth: Falsches Passwort → muss 401 sein
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "admin", "password": "wrongpassword"}')
echo "Falsches Passwort HTTP Code: $HTTP_CODE (erwartet: 401 oder 400)"
```

### B3 — ESP Device Endpoints

```bash
# Alle Devices
curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/esp/devices | jq 'length'

# Device Detail
curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/esp/devices/MOCK_CHAOS01 | jq '{esp_id, status, is_approved}'

# Pending Devices
curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/esp/devices?status=pending | jq 'length'

# Device nicht gefunden → muss 404 sein
HTTP_404=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/esp/devices/NONEXISTENT_DEVICE)
echo "Nicht-existentes Device: HTTP $HTTP_404 (erwartet: 404)"
```

### B4 — Sensor Endpoints

**WICHTIG:** Sensor-Configs nutzen Path-Parameter (/{esp_id}/{gpio}), nicht Query-Parameter.
Sensor-Data nutzt Query-Parameter (esp_id, gpio, sensor_type, limit, start_time, end_time, quality).

```bash
# Sensor-Config fuer spezifischen Sensor
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/MOCK_CHAOS01/21" | jq .
# Sensor-Config erstellen/updaten
# POST /api/v1/sensors/{esp_id}/{gpio} mit Payload

# Sensor-Daten API (kritisch — war 500 im Trockentest!)
HTTP_SENSOR=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/data?esp_id=MOCK_CHAOS01")
echo "Sensor-Data API: HTTP $HTTP_SENSOR (erwartet: 200)"

# Falls 500: Trockentest-Fix Block B ist noch offen!
if [ "$HTTP_SENSOR" = "500" ]; then
  echo "BUG: Sensor-Data API 500 — Block B aus auftrag-trockentest-fix.md umsetzen!"
  docker logs automationone-server 2>&1 | grep -A 20 "sensors/data.*ERROR\|Traceback" | tail -30
fi

# Sensor-Daten mit Limit
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/data?esp_id=MOCK_CHAOS01&limit=5" | jq 'length'

# Sensor-Daten mit Quality-Filter
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/data?esp_id=MOCK_CHAOS01&quality=good&limit=10" | jq 'length'

# Aggregierte Daten (falls Endpoint existiert)
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/data?esp_id=MOCK_CHAOS01&resolution=1m" 2>/dev/null || echo "resolution-Parameter nicht implementiert"
```

### B5 — Zone + Subzone Endpoints

**WICHTIG:** Zone-API ist ESP-fokussiert (Prefix: `/api/v1/zone/`). Es gibt KEINE unabhaengige Zone-Collection (`/api/v1/zones` existiert NICHT). Zonen werden als Property eines ESP-Devices verwaltet.

```bash
# Zone-Info fuer einen ESP abrufen
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/zone/devices/MOCK_CHAOS01 | jq .

# Zone dem Mock-ESP zuweisen
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/zone/devices/MOCK_CHAOS01/assign \
  -d '{"zone_id": "chaos_test", "zone_name": "ChaosTestZone"}'
echo "Zone zugewiesen (Pruefe Response auf mqtt_sent)"

# Alle ESPs in einer Zone
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/zone/chaos_test/devices | jq .

# Unassigned ESPs
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/zone/unassigned | jq .

# Zone-Zuweisung entfernen (Cleanup)
curl -sf -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/zone/devices/MOCK_CHAOS01/zone | jq .

# Subzonen (Prefix: /api/v1/subzone/)
curl -sf -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/subzone/devices/MOCK_CHAOS01/subzones 2>/dev/null || \
  echo "Subzone-Endpoint: keine Subzones konfiguriert"
```

### B6 — Logic Engine Endpoints

```bash
# Alle Regeln
curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/logic/rules | jq 'length'

# Regel erstellen (minimal, kein echter Trigger)
RULE_RESP=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d '{
    "name": "ChaosTestRule",
    "enabled": false,
    "conditions": [{"type": "sensor_threshold", "sensor_id": "test", "operator": ">", "value": 100}],
    "actions": [{"type": "log", "message": "chaos test triggered"}]
  }') 2>/dev/null
RULE_ID=$(echo $RULE_RESP | jq -r '.id // .rule_id')
echo "Regel erstellt: $RULE_ID (oder Endpoint-Format pruefen)"

# Regel loeschen (Cleanup)
if [ -n "$RULE_ID" ] && [ "$RULE_ID" != "null" ]; then
  curl -sf -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "http://localhost:8000/api/v1/logic/rules/$RULE_ID"
fi
```

### B7 — Error-Handling systematisch pruefen

```bash
# 400: Fehlerhafter JSON-Body
HTTP_400=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/esp/devices \
  -d 'invalid json{{{')
echo "Invalider JSON: HTTP $HTTP_400 (erwartet: 400 oder 422)"

# 401: Kein Token
HTTP_401=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/esp/devices)
echo "Kein Token: HTTP $HTTP_401 (erwartet: 401)"

# 403: Operator versucht Admin-Endpoint (falls User existiert)
# 404: Nicht-existente Ressource → bereits in B3 geprueft

# 422: Validierungsfehler (z.B. falscher Typ)
HTTP_422=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  http://localhost:8000/api/v1/logic/rules \
  -d '{"name": 12345}')  # name muss String sein
echo "Validierungsfehler: HTTP $HTTP_422 (erwartet: 422)"
```

### B8 — Concurrent Requests pruefen

```bash
# 10 parallele Requests auf /health
echo "Concurrent-Test (10x /health):"
for i in $(seq 1 10); do
  curl -sf http://localhost:8000/health > /dev/null &
done
wait
echo "Alle 10 parallelen Requests abgeschlossen"

# 5 parallele Sensor-Data-Abfragen
echo "Concurrent Sensor-Data (5x):"
for i in $(seq 1 5); do
  curl -sf -H "Authorization: Bearer $TOKEN" \
    "http://localhost:8000/api/v1/sensors/data?esp_id=MOCK_CHAOS01&limit=10" > /dev/null &
done
wait
echo "Alle 5 parallelen Sensor-Abfragen abgeschlossen"
```

### B9 — WebSocket-Verbindung pruefen

```bash
# WebSocket-Events pruefen (falls wscat installiert oder Python verfuegbar)
# WICHTIG: WS-Pfad ist /api/v1/ws/realtime/{client_id} mit Token als Query-Parameter!
python3 -c "
import asyncio, websockets, json, uuid

async def test_ws():
    client_id = str(uuid.uuid4())[:8]
    uri = f'ws://localhost:8000/api/v1/ws/realtime/{client_id}?token=${TOKEN}'
    try:
        async with websockets.connect(uri) as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=10)
            data = json.loads(msg)
            print(f'WS Event empfangen: {data.get(\"type\", \"unknown\")}')
    except Exception as e:
        print(f'WS Fehler: {e}')

asyncio.run(test_ws())
" 2>/dev/null || echo "WebSocket-Test: wscat oder websockets-Python-Modul noetig"
```

### B10 — API-Rapport erstellen

Alle Ergebnisse dokumentieren in: `.claude/reports/current/CHAOS_API_REPORT.md`

Format:
```
| Endpoint | Method | HTTP-Code | Erwartung | OK/FEHLER | Fix-Notiz |
```

### Block B Checkliste

- [ ] Alle ~170 Endpoints inventarisiert (OpenAPI-Schema ausgelesen)
- [ ] Health-Endpoints: alle 200
- [ ] Auth-Flow vollstaendig geprueft (Login, Refresh, 401, falsche Credentials)
- [ ] ESP Device CRUD: alle Operationen geprueft
- [ ] Sensor-Data API: HTTP 200 (NICHT 500 — falls noch kaputt: Fix aus auftrag-trockentest-fix.md Block B umsetzen!)
- [ ] Zone Endpoints (/api/v1/zone/): assign, remove, get-info, get-devices, unassigned
- [ ] Subzone Endpoints (/api/v1/subzone/): assign, list, delete, safe-mode
- [ ] Logic Engine Endpoints: grundlegend funktionstuechtg
- [ ] Error-Handling: 400, 401, 404, 422 korrekt zurueck
- [ ] Concurrent: kein Crash bei 10 parallelen Requests
- [ ] WebSocket: verbindet sich, empfaengt Events
- [ ] CHAOS_API_REPORT.md erstellt

**Zeitschaetzung Block B:** 2-3 Stunden

---

## Block C: MQTT-Pipeline End-to-End

**Ziel:** Die komplette MQTT-Datenpipeline systematisch durchspielen. Alle 15 Handler verifizieren (12 Core + 3 Mock-ESP).

### C1 — MQTT-Broker Status

```bash
# Aktive Clients
docker exec automationone-mqtt mosquitto_sub \
  -h localhost -p 1883 \
  -t '$SYS/broker/clients/connected' -C 1 -W 5

# Broker-Metriken via Prometheus
curl -sf "http://localhost:9090/api/v1/query?query=mqtt_broker_clients_connected" | \
  jq '.data.result[0].value[1]'
```

### C2 — Alle 12 MQTT-Handler testen

**C2.1 Heartbeat-Handler:**
```bash
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/system/heartbeat" \
  -m "{\"ts\":$(date +%s),\"uptime\":5000,\"heap_free\":195000,\"wifi_rssi\":-42}"
sleep 3
# Verifikation: last_seen in DB aktualisiert?
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT device_id, last_seen FROM esp_devices WHERE device_id='MOCK_CHAOS01';"
```

**C2.2 Sensor-Data-Handler:**
```bash
# Alle bekannten Sensor-Typen testen
for SENSOR in "sht31_temp:22.5:C" "sht31_humidity:58.0:%RH" "ds18b20:23.1:C" "ph:7.2:pH" "ec:1500:uS/cm"; do
  TYPE=$(echo $SENSOR | cut -d: -f1)
  VAL=$(echo $SENSOR | cut -d: -f2)
  UNIT=$(echo $SENSOR | cut -d: -f3)
  docker exec automationone-mqtt mosquitto_pub \
    -h localhost -p 1883 \
    -t "kaiser/god/esp/MOCK_CHAOS01/sensor/21/data" \
    -m "{\"ts\":$(date +%s),\"esp_id\":\"MOCK_CHAOS01\",\"gpio\":21,\"sensor_type\":\"$TYPE\",\"raw\":2250,\"raw_mode\":false,\"value\":$VAL,\"unit\":\"$UNIT\",\"quality\":\"good\"}"
  sleep 2
done
echo "Sensor-Data-Handler: alle Typen gesendet"
```

**C2.3 LWT-Handler (Last Will Testament):**
```bash
# LWT = ESP offline gegangen
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/system/will" \
  -m "{\"status\":\"offline\",\"reason\":\"timeout\"}"
sleep 3
# Verifikation: Status = offline in DB?
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT device_id, status FROM esp_devices WHERE device_id='MOCK_CHAOS01';"
# Dann wieder online setzen:
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/system/heartbeat" \
  -m "{\"ts\":$(date +%s),\"uptime\":6000,\"heap_free\":200000,\"wifi_rssi\":-40}"
```

**C2.4 Config-Handler:**
```bash
# Config-Response vom Mock-ESP (ESP bestaetigt Konfiguration)
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/config_response" \
  -m "{\"ts\":$(date +%s),\"status\":\"accepted\",\"config_id\":\"cfg_test_01\",\"sensor_type\":\"sht31\"}"
sleep 3
docker logs automationone-server 2>&1 | grep "config_response\|config.*MOCK_CHAOS01" | tail -5
```

**C2.5 Error-Handler:**
```bash
# Error-Meldung vom Mock-ESP
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/system/error" \
  -m "{\"ts\":$(date +%s),\"error_code\":3001,\"message\":\"Sensor read failed\",\"component\":\"I2C\"}" 2>/dev/null || \
  echo "Error-Topic: Format pruefen (oder handler-Verzeichnis inspizieren)"
```

**C2.6 Discovery-Handler:**
```bash
# Neues Device via Discovery (noch nicht in DB)
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_DISCOVER01/system/heartbeat" \
  -m "{\"ts\":$(date +%s),\"uptime\":100,\"heap_free\":200000,\"wifi_rssi\":-50}"
sleep 5
# Pruefen ob in Pending-Liste
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT device_id, status, approved_at FROM esp_devices WHERE device_id='MOCK_DISCOVER01';"
# Cleanup:
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "DELETE FROM esp_devices WHERE device_id='MOCK_DISCOVER01';"
```

**C2.7 Actuator-Commands-Handler:**
```bash
# Aktor-Kommando an Mock senden
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/actuator/1/command" \
  -m "{\"ts\":$(date +%s),\"command\":\"on\",\"duration\":5000}" 2>/dev/null || \
  echo "Actuator-Command-Topic: Format pruefen"
```

### C3 — MQTT → DB → WebSocket → Frontend Pipeline

```bash
# Sensor senden
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/sensor/21/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"MOCK_CHAOS01\",\"gpio\":21,\"sensor_type\":\"sht31_temp\",\"raw\":2300,\"raw_mode\":false,\"value\":23.0,\"unit\":\"C\",\"quality\":\"good\"}"

# 3 Sekunden warten
sleep 3

# DB-Check: Wert angekommen?
# HINWEIS: sensor_data.esp_id ist UUID FK → JOIN noetig. Spalte heisst processed_value (nicht value).
LAST_VAL=$(docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -t -c \
  "SELECT sd.processed_value FROM sensor_data sd
   JOIN esp_devices ed ON sd.esp_id = ed.id
   WHERE ed.device_id='MOCK_CHAOS01' AND sd.sensor_type='sht31_temp'
   ORDER BY sd.timestamp DESC LIMIT 1;")
echo "Letzter DB-Wert: $LAST_VAL (erwartet: ~23.0)"

# Prometheus-Check: Metrik aktualisiert?
PROM_VAL=$(curl -sf "http://localhost:9090/api/v1/query?query=god_kaiser_sensor_value{esp_id=\"MOCK_CHAOS01\",sensor_type=\"sht31_temp\"}" | \
  jq -r '.data.result[0].value[1]')
echo "Prometheus-Wert: $PROM_VAL (erwartet: ~23.0)"
```

### C4 — MQTT-Latenz messen

```bash
# Zeit messen: MQTT-Publish → DB-Eintrag
START=$(date +%s%N)
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/sensor/21/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"MOCK_CHAOS01\",\"gpio\":21,\"sensor_type\":\"sht31_temp\",\"raw\":2350,\"raw_mode\":false,\"value\":23.5,\"unit\":\"C\",\"quality\":\"good\"}"

# Polling bis Wert in DB (max 10s)
for i in $(seq 1 20); do
  sleep 0.5
  DB_CHECK=$(docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -t -c \
    "SELECT COUNT(*) FROM sensor_data sd JOIN esp_devices ed ON sd.esp_id = ed.id WHERE ed.device_id='MOCK_CHAOS01' AND sd.processed_value=23.5 AND sd.timestamp > NOW() - INTERVAL '30 seconds';")
  if [ "${DB_CHECK// /}" = "1" ]; then
    END=$(date +%s%N)
    LATENCY_MS=$(( (END - START) / 1000000 ))
    echo "MQTT → DB Latenz: ${LATENCY_MS}ms"
    break
  fi
done
```

### Block C Checkliste

- [ ] MQTT-Broker: Status und Connected-Clients dokumentiert
- [ ] Heartbeat-Handler: aktualisiert last_seen in DB
- [ ] Sensor-Data-Handler: alle 9 Sensor-Typen versucht (mindestens sht31_temp, sht31_humidity, ds18b20, ph, ec)
- [ ] Actuator-Status-Handler: bestaetigt Status-Updates
- [ ] Actuator-Response-Handler (Phase 8): Command-Confirmations
- [ ] Actuator-Alert-Handler (Phase 8): Alert-Events
- [ ] Diagnostics-Handler: System-Diagnose-Meldungen
- [ ] Zone-ACK-Handler: Zone-Assignment-Bestaetigungen
- [ ] Subzone-ACK-Handler (Phase 9): Subzone-Bestaetigungen
- [ ] LWT-Handler: setzt Status auf offline
- [ ] Config-Handler: nimmt Config-Response entgegen
- [ ] Discovery-Handler: neue ESPs landen in Pending (mit korrektem Heartbeat-Format!)
- [ ] MQTT → DB → Prometheus Pipeline: alle 3 Stationen erhalten Daten
- [ ] Latenz MQTT → DB gemessen (Ziel: < 500ms)
- [ ] Kein MQTT-Handler-Crash in Server-Logs

**Zeitschaetzung Block C:** 1-2 Stunden

---

## Block D: Frontend Komplett-Test

**Ziel:** Alle 16+ Views systematisch durchgehen. Jede Funktion erreichbar und fehlerfrei? Kleine CSS/UX-Bugs direkt fixen.

**Voraussetzung:** Frontend laueft (http://localhost:5173) und Mock-ESP MOCK_CHAOS01 ist aktiv.

**Test-Methode:** Playwright MCP-Server nutzen wenn im Hauptkontext. Bei Subagenten: Bash-Script mit curl fuer API-Checks, Playwright-Befehle dokumentieren fuer manuellen Robin-Check.

### D1 — Route-Inventar verifizieren

```bash
# Frontend erreichbar?
HTTP_FRONT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173)
echo "Frontend HTTP: $HTTP_FRONT (erwartet: 200)"

# Alle Router-Konfigurations-Dateien analysieren
grep -n "path:" "El Frontend/src/router/index.ts" | head -40
```

### D2 — Jede View pruefen (16 Views)

Fuer jede View:
1. Route erreichbar (HTTP 200 oder SPA-Redirect)
2. API-Calls funktionieren (in Server-Logs pruefen)
3. Keine JS-Errors in Browser-Console (soweit ohne Browser pruefbar)

| Route | View | Test-Aktion | Erwartung |
|-------|------|------------|-----------|
| `/hardware` | HardwareView | GET http://localhost:5173/hardware | 200, Zone-Liste geladen |
| `/hardware/{zone}/{esp}` | HardwareView Level 3 | Deep-Link zu ESP | 200, Orbital-Layout |
| `/monitor` | MonitorView | GET /monitor | 200, Sensor-Kacheln |
| `/custom-dashboard` | CustomDashboardView | GET /custom-dashboard | 200, GridStack leer oder mit Widgets |
| `/sensors` | SensorsView | GET /sensors | 200, Sensor-Tabelle |
| `/logic` | LogicView | GET /logic | 200, Rule-Builder |
| `/settings` | SettingsView | GET /settings | 200, User-Info |
| `/system-monitor` | SystemMonitorView | GET /system-monitor | 200, 5 Tabs |
| `/users` | UserManagementView | GET /users | 200, User-Tabelle |
| `/calibration` | CalibrationView | GET /calibration | 200, Wizard |
| `/sensor-history` | SensorHistoryView | GET /sensor-history | 200, Chart |
| `/system-config` | SystemConfigView | GET /system-config | 200, Config-Editor |
| `/maintenance` | MaintenanceView | GET /maintenance | 200, Service-Status |
| `/load-test` | LoadTestView | GET /load-test | 200, Mock-Generator |
| `/login` | LoginView | GET /login | 200, Login-Form |
| `/setup` | SetupView | GET /setup | 200, Setup-Wizard (nur wenn kein Admin existiert) |
| `/dashboard-legacy` | Legacy (Redirect) | GET /dashboard-legacy | 302 Redirect → /hardware (DEPRECATED 2026-02-23) |

```bash
# Automatisierter Route-Check
for ROUTE in /hardware /monitor /custom-dashboard /sensors /logic /settings /system-monitor /users /calibration /sensor-history /system-config /maintenance /load-test /login /setup; do
  # SPA gibt immer 200 zurueck (React/Vue), aber API-Calls im Hintergrund koennen scheitern
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5173${ROUTE}")
  echo "$ROUTE: HTTP $HTTP"
done
```

### D3 — HardwareView 3-Level-Zoom pruefen

Kritischer Flow: Zone → ESP → Detail

```bash
# Zone-Liste API
curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/zones | jq '[.[] | {id, name}]'

# ESP-Liste API (fuer HardwareView)
curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/esp/devices | \
  jq '[.[] | {esp_id, status, zone: .zone_id}]'
```

**Manuell pruefen (Robin oder Playwright):**
- [ ] Zone anklicken → ESP-Liste sichtbar
- [ ] ESP anklicken → Orbital-Layout sichtbar (MOCK_CHAOS01)
- [ ] Sensor in Orbital-Layout sichtbar (sht31_temp + sht31_humidity)
- [ ] Browser-Back-Button funktioniert (URL-Sync)

### D4 — MonitorView Sensor-Monitoring pruefen

```bash
# API die MonitorView nutzt
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/data?esp_id=MOCK_CHAOS01&limit=20" | \
  jq 'if type=="array" then length else "FEHLER" end'
```

**Manuell pruefen:**
- [ ] MOCK_CHAOS01 Sensoren sichtbar
- [ ] Werte aktualisieren sich live (WebSocket)
- [ ] Temperatur ~18-30°C (realistische Mock-Werte)
- [ ] Luftfeuchtigkeit ~40-80% RH

### D5 — CustomDashboardView pruefen

```bash
# Dashboard-API
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/dashboards" 2>/dev/null | jq . || \
  echo "Dashboard-Persistenz-Endpoint FEHLT — bekanntes offenes Item"
```

**Manuell pruefen:**
- [ ] GridStack laedt (keine JS-Fehler)
- [ ] Widget-Galerie (Component-Sidebar) sichtbar
- [ ] Widget per Drag einsetzen moeglich (ACHTUNG: DnD-Bugs bekannt!)
- [ ] Widget konfigurierbar
- [ ] Layout speichern (falls Endpoint existiert)

### D6 — Formulare und Modals systematisch pruefen

**AddSensorModal:**
- [ ] Oeffnet sich per Button-Klick (nicht nur per DnD)
- [ ] Sensor-Typ waehlbar
- [ ] I2C-Adresse (0x44) eingeben moeglich
- [ ] Speichern → Sensor-Config in DB
- [ ] BEKANNTER BUG: DnD setzt Sensor-Typ nicht vor → `auftrag-dnd-sensor-aktor-drop-fix.md`

**AddActuatorModal:**
- [ ] Oeffnet sich per Button-Klick
- [ ] Aktor-Typ waehlbar (Pump/Valve/PWM/Relay)
- [ ] BEKANNTER BUG: addActuator() routet nur zu Mock-API → `auftrag-dnd-sensor-aktor-drop-fix.md`

**CreateMockEspModal:**
- [ ] Erstellt neuen Mock
- [ ] Mock erscheint sofort in Device-Liste

**SlideOver-Panels:**
- [ ] SensorConfigPanel oeffnet sich
- [ ] Einstellungen aenderbar
- [ ] Aenderungen werden gespeichert
- [ ] Panel schliesst sich

### D7 — Navigation vollstaendig pruefen

```bash
# Deprecated Redirects pruefen (sollen weiterleiten, nicht 404)
# Korrekte Redirect-Ziele aus dem Router:
# /devices → /hardware
# /mock-esp → /hardware
# /database → /system-monitor?tab=database
# /logs → /system-monitor?tab=logs
# /actuators → /sensors?tab=actuators
# /audit → /system-monitor?tab=events
# /mqtt-log → /system-monitor?tab=mqtt
for REDIRECT in /devices /mock-esp /database /logs /actuators /audit /mqtt-log; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -L "http://localhost:5173${REDIRECT}")
  echo "Redirect $REDIRECT: HTTP $HTTP"
done
```

**Manuell:**
- [ ] Sidebar hat max. 6-8 Eintraege (nicht 14+)
- [ ] Tab-System (Hardware/Monitor/Dashboard) funktioniert
- [ ] Breadcrumb-Navigation korrekt
- [ ] Emergency-Stop-Button sichtbar und klickbar (soll Bestaetigung zeigen)
- [ ] User-Menu (Logout, Settings)

### D8 — Performance messen

```bash
# API-Response-Zeiten
for ENDPOINT in "/health" "/api/v1/esp/devices" "/api/v1/zones" "/api/v1/sensors/data?limit=50"; do
  DURATION=$(curl -s -o /dev/null -w "%{time_total}" \
    -H "Authorization: Bearer $TOKEN" \
    "http://localhost:8000${ENDPOINT}")
  echo "$ENDPOINT: ${DURATION}s (Ziel: < 0.5s)"
done

# Prometheus-Query Antwortzeit
time curl -sf "http://localhost:9090/api/v1/query?query=god_kaiser_sensor_value" > /dev/null
```

### D9 — Error-States pruefen

**Manuell (oder Playwright):**
- [ ] Was passiert wenn Backend nicht erreichbar? (curl -X POST http://localhost:8000/actuator/offline 2>/dev/null || true)
- [ ] Empty-State bei leerem Dashboard korrekt?
- [ ] Loading-State bei langsamer API sichtbar?
- [ ] Fehler-Toast bei API-500?

### Block D Checkliste

- [ ] Alle 17 Views laden ohne 500-Fehler (inkl. /setup)
- [ ] /dashboard-legacy: Redirect nach /hardware (DEPRECATED 2026-02-23)
- [ ] HardwareView 3-Level-Zoom funktioniert
- [ ] MonitorView zeigt MOCK_CHAOS01 Daten live
- [ ] AddSensorModal oeffnet sich und speichert
- [ ] Deprecated Redirects leiten korrekt weiter
- [ ] Navigation: Sidebar + Breadcrumb + Emergency-Stop funktionieren
- [ ] API-Response-Zeiten < 500ms (ausser komplexe Queries)
- [ ] Kleine CSS/UX-Bugs direkt gefixt und committet
- [ ] DnD-Bugs dokumentiert (nicht hier fixen — eigener Auftrag)

**Zeitschaetzung Block D:** 3-4 Stunden

---

## Block E: Datenbank-Konsistenz

**Ziel:** 19 Tabellen pruefen. Schema validieren. Stale-Daten bereinigen. Migration-Status sicherstellen.

### E1 — Schema-Inventar

```bash
# Alle 19 Tabellen mit Row-Count
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT schemaname, tablename,
       (xpath('/row/cnt/text()', xmlelement(name row,
        xmlelement(name cnt, (SELECT COUNT(*) FROM information_schema.columns
                              WHERE table_name=t.tablename)))))[1]::text::int as columns
FROM pg_tables t
WHERE schemaname='public'
ORDER BY tablename;" 2>/dev/null

# Row-Count pro Tabelle
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT relname as table_name, n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;"
```

### E2 — Alembic-Migration-Status

```bash
# Migrations up-to-date?
docker exec automationone-server bash -c "
cd /app && alembic current 2>/dev/null || \
python -m alembic current 2>/dev/null || \
echo 'Alembic-Command: Pfad pruefen'"

# Ausstehende Migrations?
docker exec automationone-server bash -c "
cd /app && alembic history --indicate-current 2>/dev/null | head -10"
```

### E3 — Referenzielle Integritaet pruefen

```bash
# Sensor-Configs ohne zugehoeriges ESP (FK: sensor_configs.esp_id → esp_devices.id, beides UUID)
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT sc.esp_id, COUNT(*) as orphan_configs
FROM sensor_configs sc
LEFT JOIN esp_devices e ON sc.esp_id = e.id
WHERE e.id IS NULL
GROUP BY sc.esp_id;"

# Sensor-Data ohne zugehoeriges ESP (FK: sensor_data.esp_id → esp_devices.id, beides UUID)
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT sd.esp_id, COUNT(*) as orphan_readings
FROM sensor_data sd
LEFT JOIN esp_devices e ON sd.esp_id = e.id
WHERE e.id IS NULL
GROUP BY sd.esp_id
LIMIT 10;"

# Audit-Logs: request_id-Laenge pruefen (Bug aus Trockentest!)
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT MAX(LENGTH(request_id)) as max_len,
       MIN(LENGTH(request_id)) as min_len,
       COUNT(*) as total
FROM audit_logs;"
# Erwartet: max_len muss VARCHAR(255) entsprechen (kein Truncation-Risiko mehr)
```

### E4 — Stale-Daten identifizieren

```bash
# ESPs ohne Heartbeat seit > 24h
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT device_id, status, last_seen,
       NOW() - last_seen as stale_since
FROM esp_devices
WHERE last_seen < NOW() - INTERVAL '24 hours'
ORDER BY last_seen;"

# Sensor-Data aelter als 7 Tage (ggf. loeschen wenn nicht noetig)
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT COUNT(*) as old_readings,
       MIN(timestamp) as oldest
FROM sensor_data
WHERE timestamp < NOW() - INTERVAL '7 days';"

# ai_predictions-Tabelle (sollte leer sein — KI-Service ist Stub)
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT COUNT(*) as ai_prediction_count FROM ai_predictions;"
```

### E5 — Performance-kritische Queries identifizieren

```bash
# Langsame Queries aus pg_stat_statements (falls Extension aktiv)
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 10;" 2>/dev/null || echo "pg_stat_statements nicht aktiviert"

# Fehlende Indices pruefen
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT schemaname, tablename, attname
FROM pg_stats
WHERE schemaname='public'
  AND n_distinct > 100
  AND attname LIKE '%_id'
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename=pg_stats.tablename
    AND indexdef LIKE '%' || attname || '%'
  );" 2>/dev/null | head -20
```

### E6 — DB-Groesse und Wachstum

```bash
# DB-Groesse (Disk-Monitoring ohne Node Exporter via pg_database_size)
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT pg_size_pretty(pg_database_size('god_kaiser_db')) as db_size,
       pg_size_pretty(pg_total_relation_size('sensor_data')) as sensor_data_size;"

# Prometheus-Check (gleiche Metrik die Grafana-Alert nutzt)
curl -sf "http://localhost:9090/api/v1/query?query=pg_database_size_bytes" | \
  jq '.data.result[0].value[1]'
```

### Block E Checkliste

- [ ] Alle 19 Tabellen vorhanden und documentiert
- [ ] Alembic: keine ausstehenden Migrations
- [ ] audit_logs.request_id: VARCHAR(255) bestaetigt (kein Truncation-Risiko — Trockentest Bug #1!)
- [ ] Keine orphaned sensor_configs (ESP geloescht aber configs bleiben)
- [ ] Keine orphaned sensor_data
- [ ] Stale ESPs identifiziert (> 24h kein Heartbeat)
- [ ] ai_predictions: leer (Stub-Service)
- [ ] DB-Groesse dokumentiert
- [ ] Performance-Probleme identifiziert (falls pg_stat_statements aktiv)

**Zeitschaetzung Block E:** 1 Stunde

---

## Block F: Chaos-Szenarien (Fehler-Injektion)

**Ziel:** Was passiert wenn Teile des Systems ausfallen? Circuit Breaker, Resilience-System und Error-Handling unter echten Fehlerbedingungen pruefen.

**Basis:** Yu et al. (2024) Chaos Engineering fuer IoT — 5 Fehlertypen: Netzwerklatenz, Service-Crash, Ressourcenerschoepfung, Message-Loss, Security-Angriffe.

### F1 — MQTT-Verbindungsabbruch simulieren

```bash
# MQTT-Broker kurz pausieren (simuliert Netzwerkausfall)
echo "=== CHAOS: MQTT-Broker 10 Sekunden pausieren ==="
docker pause automationone-mqtt
sleep 10
docker unpause automationone-mqtt
sleep 5

# Was passiert im Server-Log?
docker logs automationone-server 2>&1 | grep -E "mqtt.*disconnect\|reconnect\|circuit.*break" | tail -10

# Hat der Server reconnected?
curl -sf http://localhost:8000/health | jq '{status: .status, mqtt_connected: .mqtt_connected}'
```

### F2 — Invalide MQTT-Payloads injizieren

```bash
# F2.1: Leerer Payload
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/sensor/21/data" \
  -m ""
sleep 2
echo "Empty payload: Kein Server-Crash?"

# F2.2: Kein JSON
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/sensor/21/data" \
  -m "not-json-at-all{{{corrupted"
sleep 2
echo "Invalid JSON: Kein Server-Crash?"

# F2.3: JSON aber falsche Felder
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/sensor/21/data" \
  -m '{"unexpected_field": 42, "no_ts": true}'
sleep 2
echo "Wrong fields: Kein Server-Crash?"

# F2.4: Extremwerte
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/sensor/21/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"MOCK_CHAOS01\",\"gpio\":21,\"sensor_type\":\"sht31_temp\",\"raw\":99999,\"raw_mode\":false,\"value\":999.9,\"unit\":\"C\",\"quality\":\"good\"}"
sleep 2

# Pruefen: Out-of-Range mit Quality-Flag gespeichert?
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "
SELECT sd.sensor_type, sd.processed_value, sd.quality FROM sensor_data sd
JOIN esp_devices ed ON sd.esp_id = ed.id
WHERE ed.device_id='MOCK_CHAOS01' AND sd.processed_value > 900
ORDER BY sd.timestamp DESC LIMIT 1;"

# F2.5: Null-Wert
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/sensor/21/data" \
  -m "{\"ts\":$(date +%s),\"esp_id\":\"MOCK_CHAOS01\",\"gpio\":21,\"sensor_type\":\"sht31_temp\",\"raw\":0,\"raw_mode\":false,\"value\":null,\"unit\":\"C\",\"quality\":\"bad\"}"
sleep 2
echo "Null-Wert: Kein Server-Crash?"
```

### F3 — Server-Neustart unter Last

```bash
# Zuerst: Last erzeugen (Hintergrund-Requests)
for i in $(seq 1 20); do
  curl -sf -H "Authorization: Bearer $TOKEN" \
    "http://localhost:8000/api/v1/sensors/data?limit=100" > /dev/null &
done

# Server-Container neustarten
echo "=== CHAOS: Server-Container neustarten ==="
docker restart automationone-server
wait

# Wie lange bis Server wieder antwortet?
for i in $(seq 1 30); do
  sleep 1
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null)
  if [ "$HTTP" = "200" ]; then
    echo "Server wieder healthy nach ${i}s"
    break
  fi
done
```

### F4 — Burst-Test (100 Sensor-Readings schnell hintereinander)

```bash
echo "=== Burst-Test: 100 MQTT-Messages in 10 Sekunden ==="
START=$(date +%s%N)
for i in $(seq 1 100); do
  TEMP=$(python3 -c "import random; print(round(random.uniform(18, 30), 1))")
  docker exec automationone-mqtt mosquitto_pub \
    -h localhost -p 1883 \
    -t "kaiser/god/esp/MOCK_CHAOS01/sensor/21/data" \
    -m "{\"ts\":$(date +%s),\"esp_id\":\"MOCK_CHAOS01\",\"gpio\":21,\"sensor_type\":\"sht31_temp\",\"raw\":$(python3 -c "print(int(${TEMP}*100))"),\"raw_mode\":false,\"value\":${TEMP},\"unit\":\"C\",\"quality\":\"good\"}"
done
END=$(date +%s%N)
DURATION_MS=$(( (END - START) / 1000000 ))
echo "100 Messages in ${DURATION_MS}ms gesendet"

sleep 5

# Wie viele sind angekommen?
COUNT=$(docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -t -c \
  "SELECT COUNT(*) FROM sensor_data sd JOIN esp_devices ed ON sd.esp_id = ed.id WHERE ed.device_id='MOCK_CHAOS01' AND sd.sensor_type='sht31_temp' AND sd.timestamp > NOW() - INTERVAL '1 minute';")
echo "In DB angekommen: ${COUNT// /} von 100+ (frueherer Test + Burst)"

# Server noch responsive?
curl -sf http://localhost:8000/health | jq '{status: .status}'
```

### F5 — Verbindungsabbruch + Reconnect

```bash
# Verbindung unterbrechen durch falsches Topic-Pattern
echo "=== F5: Netzwerk-Partition simulieren ==="

# MOCK_CHAOS01 geht offline (LWT)
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/system/will" \
  -m "{\"status\":\"offline\",\"reason\":\"network_partition\"}"

sleep 5

# Pruefen: Status in DB?
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -t -c \
  "SELECT status FROM esp_devices WHERE device_id='MOCK_CHAOS01';"

# Reconnect (Heartbeat)
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_CHAOS01/system/heartbeat" \
  -m "{\"ts\":$(date +%s),\"uptime\":99000,\"heap_free\":195000,\"wifi_rssi\":-38}"

sleep 3

# Status zurueck auf online?
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -t -c \
  "SELECT status FROM esp_devices WHERE device_id='MOCK_CHAOS01';"
```

### Block F Checkliste

- [ ] MQTT-Pause: Server reconnected ohne manuellen Eingriff
- [ ] Empty Payload: Server crasht NICHT (Error-Log vorhanden)
- [ ] Invalid JSON: Server crasht NICHT
- [ ] Out-of-Range (999.9°C): Gespeichert mit Quality-Flag "critical" oder "implausible"
- [ ] Null-Wert: Kein Server-Crash (wird als "bad" gespeichert oder verworfen — beides OK)
- [ ] Server-Neustart: Healthy wieder in < 30 Sekunden
- [ ] Burst-Test 100: Kein Datenverlust, kein Crash, Server responsive
- [ ] LWT + Reconnect: Status-Transition offline→online korrekt
- [ ] Alle Chaos-Szenarien im CHAOS_RESILIENCE_REPORT.md dokumentiert

**Zeitschaetzung Block F:** 2 Stunden

---

## Block G: UX-Qualitaets-Audit

**Ziel:** Frontend aus Nutzerperspektive systematisch bewerten. Fehler direkt fixen (CSS, Texte, kleine JS-Fixes). Groessere Probleme als Issues dokumentieren.

### G1 — 5-Sekunden-Test (Goldstandard)

Auf das Dashboard schauen: Ist in 5 Sekunden erkennbar ob alles OK ist?

**Pruefkriterien:**
- [ ] Status-Farben sofort erkennbar (gruen = OK, rot = Fehler, grau = offline)
- [ ] MOCK_CHAOS01 sichtbar ohne zu scrollen
- [ ] Werte aktuell (Timestamp < 60 Sekunden alt)
- [ ] Kein Spinner der ewig dreht
- [ ] ColorLegend.vue sichtbar (falls implementiert)

### G2 — Konsistenz-Audit

```bash
# Hardcoded Hex-Farben finden (sollen durch CSS-Tokens ersetzt sein)
grep -rn "#[0-9A-Fa-f]\{6\}\|#[0-9A-Fa-f]\{3\}" \
  "El Frontend/src/" --include="*.vue" --include="*.ts" | \
  grep -v ".test.\|node_modules\|tokens.css\|// \|/*" | \
  wc -l
echo "Hardcoded Hex-Farben noch vorhanden (Ziel: < 20)"

# Deutsch/Englisch-Mix pruefen (kritische Stellen)
grep -rn "Sign Out\|User Account\|Device\|Connected\|Offline" \
  "El Frontend/src/views/" --include="*.vue" | \
  grep -v "// \|/*" | head -20

# Fehlende Loading-States
grep -rn "isLoading\|loading\|skeleton" "El Frontend/src/views/" --include="*.vue" | wc -l
echo "Loading-State-Referenzen in Views"
```

### G3 — Formulare und Validierung

```bash
# Fehlende Pflichtfeld-Validierung in Modals pruefen
grep -rn "required\|v-model\|@submit" "El Frontend/src/components/" --include="*.vue" | \
  grep -v "// " | head -30

# Error-Messages in Formularen
grep -rn "error-message\|form-error\|validation\|isInvalid" \
  "El Frontend/src/components/" --include="*.vue" | wc -l
echo "Validierungs-Referenzen in Komponenten"
```

### G4 — Barrierefreiheit Grundcheck

```bash
# ARIA-Labels vorhanden?
grep -rn "aria-label\|role=\"" "El Frontend/src/" --include="*.vue" | wc -l

# Fehlende alt-Tags bei Bildern
grep -rn "<img " "El Frontend/src/" --include="*.vue" | \
  grep -v "alt=" | grep -v "// " | head -10

# Button ohne Text und ohne aria-label
grep -rn "<button" "El Frontend/src/" --include="*.vue" | \
  grep -v "aria-label\|>.*<\|v-" | head -10

# Tab-Order: tabindex Nutzung
grep -rn "tabindex" "El Frontend/src/" --include="*.vue" | head -10
```

### G5 — Empty-States und Error-States pruefen

```bash
# EmptyState-Komponente genutzt?
grep -rn "EmptyState\|empty-state\|no-data\|no-results" \
  "El Frontend/src/" --include="*.vue" | wc -l

# Error-Handling in API-Calls
grep -rn "catch\|onError\|error\." "El Frontend/src/composables/" --include="*.ts" | \
  grep -v "// " | wc -l

# Toast-Notifications bei Fehlern
grep -rn "toast\|notification\|useToast" "El Frontend/src/" --include="*.ts" --include="*.vue" | wc -l
```

### G6 — Responsive Design pruefen

```bash
# Breakpoint-Klassen in Views
grep -rn "sm:\|md:\|lg:\|xl:\|2xl:" "El Frontend/src/views/" --include="*.vue" | \
  grep -v "// " | wc -l
echo "Responsive-Klassen in Views"

# Views ohne jegliche responsive Klasse
for VIEW in "El Frontend/src/views/"*.vue; do
  COUNT=$(grep -c "sm:\|md:\|lg:\|xl:" "$VIEW" 2>/dev/null || echo 0)
  echo "$(basename $VIEW): $COUNT responsive Klassen"
done
```

### G7 — Direkte Kleine Fixes (Agent macht sofort)

Folgende Fixes sollen DIREKT committet werden wenn gefunden:
- Hardcoded `#FFFFFF`, `#000000`, `color: red` → durch CSS-Tokens ersetzen
- `console.log` in Production-Code → entfernen oder auf `logger.debug` aendern
- `TODO` oder `FIXME` Kommentare in kritischen Pfaden → als Issue dokumentieren
- Fehlende `alt=""` bei dekorativen Bildern → ergaenzen
- `role="alert"` fehlt bei Error-Meldungen → ergaenzen
- Doppeltes Import-Statement → entfernen
- Tote Links in Navigation → fixen oder entfernen

```bash
# console.log in Production-Code
grep -rn "console.log\|console.warn\|console.error" \
  "El Frontend/src/" --include="*.ts" --include="*.vue" | \
  grep -v "// \|logger\|test\|spec\|node_modules" | \
  grep -v "createLogger\|logger.log" | head -20

# TODO/FIXME
grep -rn "TODO\|FIXME\|HACK\|XXX" \
  "El Frontend/src/" --include="*.ts" --include="*.vue" | \
  grep -v "// " | head -20
```

### Block G Checkliste

- [ ] 5-Sekunden-Test: Dashboard zeigt Status in < 5s
- [ ] Hardcoded Hex-Farben: gezaehlt, Trend sinkend
- [ ] Deutsch/Englisch-Mix: kritische Stellen dokumentiert
- [ ] Loading-States: vorhanden in kritischen Views
- [ ] Barrierefreiheit: ARIA-Labels grundlegend vorhanden
- [ ] Empty-States: vorhanden wenn keine Daten
- [ ] Error-States: API-Fehler werden dem Nutzer gezeigt
- [ ] Responsive: mindestens HardwareView und MonitorView haben Breakpoints
- [ ] console.log in Production: entfernt oder durch Logger ersetzt
- [ ] Kleine Fixes committet auf feature/chaos-mock-volltest

**Zeitschaetzung Block G:** 2-3 Stunden

---

## Block H: Monitoring-Integration (Platzhalter)

> **Status: OFFEN — zu bearbeiten nach Block A-G**

### H1 — Grafana-Dashboard zu Mock-Daten

- [ ] Grafana-Panels zeigen MOCK_CHAOS01-Daten
- [ ] 38/38 Alerts in korrektem Status (keine false positives)
- [ ] Loki: Server-Logs fuer Mock-Requests suchbar
- [ ] Alert-Notifications konfiguriert (Webhook → Frontend)

### H2 — Alert-Lifecycle pruefen

- [ ] Heartbeat-Gap Alert feuert nach 2+ Minuten ohne Heartbeat
- [ ] Alert loest sich auf wenn Heartbeat wieder kommt
- [ ] Sensor-Drift-Alert feuert bei 3-Sigma-Abweichung

### H3 — Log-Korrelation pruefen

- [ ] Correlation-IDs in Grafana/Loki suchbar
- [ ] Cross-Layer-Trace: ESP32 seq → Server correlation_id → Loki

**Zeitschaetzung Block H:** 1-2 Stunden

---

## Block I: Wokwi-Integration (Platzhalter)

> **Status: OFFEN — nach Block A-H**

### I1 — Wokwi SIL + Mock-Server kombinieren

- [ ] Wokwi-Simulator laeuft (173 Szenarien)
- [ ] Mock-Server beantwortet Wokwi-MQTT-Messages
- [ ] Error-Injection-Szenarien via Wokwi

### I2 — 3-Agenten Closed-Loop

- [ ] Scenario-Generator → Wokwi-MCP → Log-Analyst
- [ ] Fehler automatisch erkannt und dokumentiert

**Zeitschaetzung Block I:** 3-5 Stunden

---

## Block J: Isolations Forest + KI-Anomalie (Platzhalter)

> **Status: OFFEN — nach Block H**

### J1 — Isolation Forest Service

- [ ] scikit-learn in pyproject.toml
- [ ] Service-Skeleton implementieren
- [ ] Gegen Mock-Daten trainieren
- [ ] Anomalie-Detection auf SHT31-Daten

**Zeitschaetzung Block J:** 4-6 Stunden

---

## Fix-on-the-fly Protokoll

Jeder Fix den der Agent macht wird hier dokumentiert:

```markdown
### Fix-Log (wird vom Agenten ergaenzt)

| Nr | Wo | Problem | Fix | Commit | Aufwand |
|----|-----|---------|-----|--------|---------|
| F-001 | | | | | |
| F-002 | | | | | |
```

**Commit-Konvention:**
```
fix(api): <kurze Beschreibung> [chaos-test]
fix(frontend): <kurze Beschreibung> [chaos-test]
fix(db): <kurze Beschreibung> [chaos-test]
feat(validation): <kurze Beschreibung> [chaos-test]
```

---

## Ergebnis-Dokumentation

### Laufende Testlauf-Berichte

Der Agent erstellt versionierte Berichte:

**Testlauf 001:** `.claude/reports/current/TESTLAUF_001.md`
**Testlauf 002:** `.claude/reports/current/TESTLAUF_002.md`

Format:
```markdown
# Chaos Engineering Mock-Volltest — Testlauf NNN — YYYY-MM-DD

## Datum: YYYY-MM-DD
## Dauer: X Stunden
## Blocks bearbeitet: A, B, C, ...
## Fixes committed: N Commits auf feature/chaos-mock-volltest

## Block-Status
| Block | Status | Kritische Funde | Commits |
|-------|--------|----------------|---------|
| A | BESTANDEN / TEILWEISE / FEHLGESCHLAGEN | ... | ... |
| B | ... | ... | ... |

## Kritische Probleme (Blocker)
1. [Problem] → [Fix-Auftrag-Referenz]

## Medium-Probleme (naechster PR)
1. [Problem] → [Fix-Plan]

## Low-Probleme (Backlog)
1. [Problem]

## Neue Erkenntnisse
- [Was war unklar und ist jetzt klar]

## Naechste Session: Bloecke H-J
```

---

## Akzeptanzkriterien

Nach jedem vollstaendigen Durchlauf (Bloecke A-G):

- [ ] MOCK_CHAOS01 laeuft stabil (Heartbeat + Sensor-Daten)
- [ ] Alle ~170 API-Endpoints inventarisiert, kritische Fehler gefixt
- [ ] MQTT-Pipeline End-to-End verifiziert (MQTT → DB → Prometheus → Frontend)
- [ ] Alle 16 Views laden ohne 500-Fehler
- [ ] 5 Chaos-Szenarien durchgespielt, kein Server-Crash
- [ ] DB-Konsistenz bestätigt (19 Tabellen, keine Orphans, Migrations up-to-date)
- [ ] UX-Audit durchgefuehrt, kleine Fixes committet
- [ ] Testlauf-Bericht erstellt: `.claude/reports/current/TESTLAUF_NNN.md`

---

## Naechste Erweiterungen (Ideen)

### Erweiterung 1: Multi-Mock-Flotten-Test

Statt 1 Mock: 10 Mocks parallel, jeder mit eigenem Sensor-Profil (Temp, pH, EC, CO2, Bodenfeuchte). Prueft Cross-ESP Logic Engine + Fleet-Health-Dashboard.

### Erweiterung 2: pH-Kalibrierungs-Test

CalibrationWizard mit Mock-pH-Sensor durchspielen. 2-Punkt-Kalibrierung (pH 4.0 + pH 7.0). Prueft Kalibrierungs-Persistenz und Grafana-Darstellung.

### Erweiterung 3: Aktor-Steuerungs-Test

Mock-Aktor (Relay) an Mock-ESP. Aus Frontend schalten. Circuit Breaker triggern (zu viele Befehle). Safety-System testen (Emergency-Stop).

### Erweiterung 4: Logic-Engine Test

Cross-ESP-Regel: "Wenn MOCK_CHAOS01.sht31_temp > 28°C → MOCK_CHAOS01.relay ON". Automatisch triggern lassen. Prueft die komplette Automatisierungskette.

### Erweiterung 5: Dashboard-Persistenz-Test

Dashboard-Layout speichern, Server neustarten, Layout laden. Prueft ob GridStack-Persistenz-Endpoint implementiert wurde.

### Erweiterung 6: Auth-JWT-Volltest

Token-Expiry simulieren (kurze TTL). Token-Refresh Flow. Role-Based-Access (Operator vs. Admin). Concurrent Sessions.

### Erweiterung 7: Migration-Test

Neue Alembic-Migration erstellen, anwenden, rollback. Prueft den Migrations-Flow unter Live-Bedingungen.

### Erweiterung 8: Grafana-Alert-Lifecycle

Jeden der 38 Alerts einmal triggern lassen. Prueft ob Thresholds korrekt gesetzt sind.

---

## Referenzen

**Life-Repo:**
- `arbeitsbereiche/automation-one/STATUS.md` — Aktueller Stand (Backend 95%, Frontend 93%)
- `arbeitsbereiche/automation-one/auftrag-dnd-sensor-aktor-drop-fix.md` — DnD-Bugs (OFFEN, nicht hier fixen!)
- `arbeitsbereiche/automation-one/auftrag-trockentest-fix.md` — Trockentest-Bugs Block B+C (falls noch offen)
- `arbeitsbereiche/automation-one/Dashboard_analyse.md` — 16 Views, 97 Komponenten, Design-System-Inventar
- `arbeitsbereiche/automation-one/masterplan-stack-organisation.md` — KI-Rollentrennung, Single-Branch-Regel
- `arbeitsbereiche/automation-one/phasenplan-testinfrastruktur.md` — Phase 2: Produktionstestfeld
- `wissen/iot-automation/2024-chaos-engineering-iot-resilience-testing.md` — Yu et al. (2024): Chaos Engineering IoT Toolkit
- `wissen/iot-automation/iot-dashboard-design-best-practices-2026.md` — 5-Sekunden-Regel, GridStack, ECharts

**Auto-One Repo:**
- `CLAUDE.md` — Projekt-Kontext, Agenten, Skills
- `El Servador/god_kaiser_server/src/api/v1/` — REST-Endpoints (~170)
- `El Servador/god_kaiser_server/src/mqtt/handlers/` — 12 MQTT-Handler
- `El Frontend/src/views/` — 16 Views
- `El Frontend/src/components/` — 97+ Komponenten
- `docker/mosquitto/mosquitto.conf` — MQTT-Broker-Konfiguration
- `.claude/reports/current/` — Hier landen alle Testlauf-Berichte

---

## Offene Punkte

- **DnD-Bugs:** auftrag-dnd-sensor-aktor-drop-fix.md NICHT in diesem Auftrag fixen — eigener Auftrag
- **Dashboard-Persistenz-Endpoint:** Noch nicht implementiert (POST /api/v1/dashboards). Testen ob vorhanden, falls nicht: dokumentieren als Sub-Auftrag
- **Trockentest Block B:** Sensor-Data API 500 — falls noch offen, hier als erstes fixen (Block B4 zeigt es)
- **Trockentest Block C:** Range-Validierung — falls noch offen, hier fixen (Block F2 testet es)
- **MOCK_CHAOS01 cleanup:** Nach Testlauf-Session MOCK_CHAOS01 aus DB loeschen (cleanup_chaos.sh erstellen)
- **pgAdmin Restart-Loop:** Nicht relevant fuer diesen Test, aber PGADMIN_DEFAULT_EMAIL fixen wenn Zeit

---

*Erstellt am 2026-02-26 durch Claude Sonnet 4.6 (Automation-Experte, Life-Repo).*
*Basis: STATUS.md, Dashboard_analyse.md, auftrag-erstanalyse-hardware-test.md, auftrag-trockentest-fix.md, masterplan-stack-organisation.md, phasenplan-testinfrastruktur.md, 2024-chaos-engineering-iot-resilience-testing.md*
