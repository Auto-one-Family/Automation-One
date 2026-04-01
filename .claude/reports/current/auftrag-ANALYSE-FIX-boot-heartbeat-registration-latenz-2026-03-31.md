# Auftrag: ANALYSE + FIX — Boot-Heartbeat-Registration-Latenz (60s statt 5s)

**Typ:** Analyse + chirurgischer Fix (Firmware + Server)
**Datum:** 2026-03-31
**Prioritaet:** HOCH — betrifft jede Boot-/Reboot-Situation
**Empfohlener Agent:** server-dev + esp32-dev (beide Seiten betroffen)
**Ergebnis:** Root-Cause-Analyse + implementierter Fix
**Abhaengigkeit:** Keine — kann sofort bearbeitet werden

---

## Kontext

AutomationOne besteht aus drei Schichten:
1. **El Trabajante** (ESP32 Firmware, C++) — Sensoren, Aktoren, Safety, MQTT-Client
2. **El Servador** (FastAPI Server, Python) — REST-API, MQTT-Handler, PostgreSQL (`god_kaiser_db`)
3. **El Frontend** (Vue 3) — Dashboard

Ein ESP32 WROOM (`esp32_dev`, ESP-ID: `ESP_EA5484`) wird rebootet. Er ist dem Server BEREITS BEKANNT — hat eine Zone (`zelt_wohnzimmer`), konfigurierte Sensoren (SHT31) und Aktoren (Relay GPIO 14, GPIO 25). Er ist in der DB als approved gespeichert.

**Problem:** Nach dem Reboot dauert es **60 Sekunden** bis der ESP vom Server als operational erkannt wird und seine Konfiguration erhaelt. Das Ziel sind **unter 10 Sekunden**.

---

## Das Problem — erklaert anhand des Serial-Outputs

Hier ist die exakte Timeline des ESP32-Boots, gemessen am Serial-Monitor. Die Firmware-Timestamps stehen in eckigen Klammern (Millisekunden seit Boot). Die absoluten UTC-Zeiten sind aus dem NTP-Sync berechnet (Unix 1774992371 bei Firmware-Time 3742ms).

### Phase 1: Boot bis MQTT-Connect (0–4s) — FUNKTIONIERT GUT

```
[   0ms]  POWERON_RESET
[ 995ms]  WiFi connected! IP: 192.168.0.161 (RSSI: -40 dBm)
[3710ms]  NTP Sync Successful — 2026-03-31T21:26:11Z
[3774ms]  MQTT connecting in Anonymous Mode, Broker: mqtt://192.168.0.39:1883
[3816ms]  MQTT_EVENT_CONNECTED
[3853ms]  Subscribe sent (QoS 1): .../system/command
[3863ms]  Subscribe sent (QoS 1): .../config
[3893ms]  Subscribe sent (QoS 1): .../broadcast/emergency
[3895ms]  Subscribe sent (QoS 1): .../actuator/+/command
[3908ms]  Subscribe sent (QoS 1): .../actuator/emergency
[3910ms]  Subscribe sent (QoS 1): .../zone/assign
[3922ms]  Subscribe sent (QoS 1): .../subzone/assign
[3935ms]  Subscribe sent (QoS 1): .../subzone/remove
[3937ms]  Subscribe sent (QoS 1): .../subzone/safe
[3948ms]  Subscribe sent (QoS 1): .../sensor/+/command
[3960ms]  Subscribe sent (QoS 0): .../system/heartbeat/ack
[3960ms]  [SAFETY-P1] All 11 MQTT topics subscribed
```

Bis hierhin laeuft alles schnell: WiFi in 1s, NTP in 3.7s, MQTT connected und subscribed in 4s.

### Phase 2: Initialer Heartbeat + PENDING_APPROVAL (4s) — HIER BEGINNT DAS PROBLEM

```
[3986ms]  Initial heartbeat sent for ESP registration
[3986ms]  MQTT subscriptions established via on_connect_callback
[3998ms]  Device not yet approved - entering PENDING_APPROVAL state
[4008ms]    → WiFi/MQTT active (heartbeats + diagnostics)
[4008ms]    → Sensors/Actuators DISABLED until approval
```

**UTC-Zeit des initialen Heartbeats: ca. 2026-03-31T21:26:11Z**

Der ESP sendet bei T=3986ms einen initialen Heartbeat und geht in den `PENDING_APPROVAL` State. In diesem State sind Sensoren und Aktoren DEAKTIVIERT — der ESP wartet auf den Heartbeat-ACK vom Server um zu wissen, dass er approved ist.

**FRAGE 1:** Dieser initiale Heartbeat wird VOR dem Publish-Queue-Init gesendet (Queue wird erst bei T=4610ms erstellt: `[SYNC] Publish queue created`). Kommt der Heartbeat ueberhaupt beim Server an? Oder wird er still gedroppt weil die Queue noch nicht existiert?

### Phase 3: Tote Wartezeit (4s bis 60s) — 56 SEKUNDEN NICHTS

Zwischen T=4008ms und T=60004ms passiert **NICHTS** im Log. Der ESP wartet. Die Hardware-Initialisierung (I2C, PWM, Sensor Manager, Actuator Manager) laeuft zwar weiter bis T=4674ms, aber danach:

```
[4610ms]  [SYNC] Publish queue created (15 slots)
[4621ms]  [SAFETY] Safety task running on core 1
[4633ms]  [COMM] Communication task running on core 0
[4653ms]  System State: 9
[4674ms]  Active Sensors: 0
          ========== 56 SEKUNDEN STILLE ==========
[60004ms] begin(): nvs_open failed: NOT_FOUND   ← NVS-Fehler (periodischer Task)
[60011ms] begin(): nvs_open failed: NOT_FOUND
[60019ms] Registration timeout - opening gate (fallback)
```

**FRAGE 2:** Warum dauert der Registration-Timeout 56 Sekunden? Der bestehende P9-Auftrag sagt `REGISTRATION_TIMEOUT_MS = 10000` (10s) in `mqtt_client.h:138`. Im Live-System sind es aber **~56s** (60019ms - 3986ms). Ist P9 noch nicht implementiert? Was ist der tatsaechliche Wert von `REGISTRATION_TIMEOUT_MS` im aktuellen Code?

**FRAGE 3:** Warum hat der Server in diesen 56 Sekunden KEINEN ACK auf den initialen Heartbeat geschickt? Der ESP ist bereits approved und in der DB. Der Server muesste den Heartbeat empfangen, den ESP als "bekannt" erkennen, und sofort einen ACK zurueckschicken.

### Phase 4: Gate oeffnet, naechster Heartbeat → Approval (60s–64s)

```
[60019ms] Registration timeout - opening gate (fallback)
[63881ms] [MEM] Free heap: 137064 B
[63921ms] MQTT message received: .../system/heartbeat/ack
[63923ms] ╔════════════════════════════════════════╗
[63934ms] ║   DEVICE APPROVED BY SERVER            ║
[63944ms] ╚════════════════════════════════════════╝
[63954ms] Transitioning from PENDING_APPROVAL to OPERATIONAL
```

**UTC-Zeit des Heartbeat-ACK: ca. 2026-03-31T21:27:11Z**

Nach dem Gate-Opening bei T=60019ms kommt der naechste regulaere Heartbeat-Zyklus (60s Intervall seit Boot). DIESER Heartbeat bekommt einen ACK — 4 Sekunden spaeter, bei T=63921ms. Danach geht alles schnell: Zone-Assignment, Config-Push, Sensor/Aktor-Konfiguration — alles innerhalb von 1 Sekunde.

### Phase 5: Config-Push und volle Operationalitaet (64s–65s) — FUNKTIONIERT GUT

```
[64022ms] Zone assignment received: zelt_wohnzimmer
[64229ms] Config push received
[64290ms] SHT31 temp configured
[64400ms] SHT31 humidity configured
[64480ms] Actuator GPIO 14 type: relay
[64533ms] Actuator GPIO 25 type: relay
[64577ms] 2 offline rules saved to NVS
[64890ms] PumpActuator GPIO 14 ON  ← erster Aktor-Command
```

Sobald der ACK da ist, laeuft alles in 1 Sekunde. Das Problem liegt AUSSCHLIESSLICH in der 56-Sekunden-Luecke davor.

---

## Zusammenfassung des Problems

| Phase | Dauer | Status |
|-------|-------|--------|
| Boot → WiFi → MQTT → Subscriptions | 4s | OK |
| Initialer Heartbeat gesendet | T=4s | Gesendet, aber **kein ACK vom Server** |
| Warten auf ACK oder Timeout | **56s** | **PROBLEM — viel zu lang** |
| Gate-Fallback oeffnet | T=60s | Timeout statt ACK |
| Naechster Heartbeat → ACK → Approved | T=64s | OK (4s Round-Trip) |
| Config-Push → Operational | T=65s | OK (1s) |

**Ziel:** T=4s Heartbeat → T=6-8s ACK → T=9s Config-Push → **T=10s operational** (statt T=65s).

---

## Analyse-Auftrag — Was du untersuchen musst

### Schritt 1: Loki-Logs pruefen (Server-Seite)

Pruefe die Loki-Logs fuer den Zeitraum **2026-03-31T21:26:00Z bis 2026-03-31T21:28:00Z** (2 Minuten rund um den Boot).

Suche nach:
1. **Hat der Server den initialen Heartbeat bei ~21:26:11Z empfangen?**
   - Filter: `heartbeat` + `ESP_EA5484`
   - Wenn ja: Was hat der Server damit gemacht? Hat er einen ACK gesendet?
   - Wenn nein: Der Heartbeat ist nie angekommen → Firmware-Problem (Queue nicht ready)

2. **Wann hat der Server den ACK gesendet (bei ~21:27:11Z)?**
   - Filter: `heartbeat_ack` oder `send_heartbeat_ack` + `ESP_EA5484`
   - Welcher Heartbeat hat den ACK ausgeloest? Der initiale oder ein spaeterer?

3. **Gibt es Discovery-Rate-Limiting oder Validation-Fehler?**
   - Filter: `rate_limit` oder `discovery` oder `validation` + `ESP_EA5484`
   - Der Server hat eine Discovery-Rate-Limit-Logik die den ACK unterdruecken kann
   - Pruefe ob der erste Heartbeat nach Reboot als "Discovery" behandelt wird

4. **ESP-Status-Uebergang in der DB:**
   - War ESP_EA5484 vor dem Reboot als `offline` markiert (LWT)?
   - Wann wurde der Status auf `online` gesetzt?

### Schritt 2: Firmware-Code analysieren

#### A) Registration-Gate und Timeout

Pruefe in `El Trabajante/src/services/communication/mqtt_client.cpp` und `mqtt_client.h`:

1. **Was ist der aktuelle Wert von `REGISTRATION_TIMEOUT_MS`?**
   - P9-Auftrag sagt 10000 (10s). Das Log zeigt ~56s. Der Wert `REGISTRATION_TIMEOUT_MS = 10000` ist in `mqtt_client.h:216` implementiert (war in P9 als Zeile 138 erwartet). **Wichtig:** Das Timeout greift AUSSCHLIESSLICH innerhalb von `publish()` — und nur bei Non-Heartbeat-Publishes. Da PENDING_APPROVAL alle Sensor/Aktor-Publishes blockiert, laeuft der Timeout-Check nie. Der Gate-Fallback wird erst ausgefuehrt, wenn eine Non-Heartbeat-Nachricht (z.B. vom WatchdogStorage-Task) versucht zu publishen. Das erklaert die 56s im Log: Der erste Non-Heartbeat-Publish kommt vom periodischen NVS/Watchdog-Task bei T≈60s. **Dies ist Root-Cause #2.**

2. **Wie funktioniert der Gate-Mechanismus?**
   - `registration_confirmed_` Boolean: Wann/wo wird es auf `true` gesetzt?
   - Wo wird der Timeout geprueft? In `publish()` oder in einem separaten Timer?
   - Wird der Timeout relativ zum MQTT-Connect oder relativ zum Boot berechnet?

3. **Was passiert beim Gate-Fallback ("opening gate")?**
   - Wird nach dem Fallback sofort ein Heartbeat gesendet?
   - Oder wartet der ESP auf den naechsten regulaeren Heartbeat-Zyklus (60s)?

#### B) Initialer Heartbeat — kommt er wirklich raus?

Pruefe in `El Trabajante/src/main.cpp`:

1. **Wo wird "Initial heartbeat sent" geloggt? (Zeile 1958)**
   - Wird der Heartbeat direkt via MQTT-Client gesendet oder via Publish-Queue?
   - Die Publish-Queue wird erst bei T=4610ms erstellt, der Heartbeat bei T=3986ms
   - Wenn er via Queue geht: Er wurde VOR der Queue gesendet → moeglicherweise gedroppt
   - Wenn er direkt via `mqttClient.publish()` geht: Er sollte ankommen (MQTT war bei T=3816ms connected)

2. **Gibt es einen Retry-Mechanismus nach Queue-Init?**
   - Nach dem Queue-Init bei T=4610ms: Wird ein erneuter Heartbeat geschickt?
   - Wahrscheinlich NEIN — das ist der Fix der fehlt

#### C) HealthMonitor Heartbeat-Intervall

Pruefe in `El Trabajante/src/error_handling/health_monitor.cpp`:

1. **Heartbeat-Publish-Intervall: 60000ms (bestaetigt im Log)**
   - `[4112ms] HealthMonitor: Publish interval set to 60000 ms`
   - Das heisst: Nach dem initialen Heartbeat bei T=4s kommt der naechste regulaere erst bei T=64s
   - Wenn der initiale nicht ankommt oder keinen ACK bekommt, wartet der ESP 60s

### Schritt 3: Server-Code analysieren

Pruefe in `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`:

1. **Wie wird ein Heartbeat von einem BEKANNTEN, APPROVED ESP verarbeitet?**
   - Wird der ACK sofort gesendet? Oder gibt es Bedingungen die den ACK verhindern?
   - Pruefe die Funktion `_send_heartbeat_ack()` — wird sie bei JEDEM Heartbeat aufgerufen?

2. **Discovery-Rate-Limit:**
   - Gibt es ein Rate-Limit das den ACK bei zu schnell aufeinanderfolgenden Heartbeats unterdrueckt?
   - Wenn ja: Greift es auch fuer bereits approved ESPs? Das waere der Bug.
   - Der erste Heartbeat nach Reboot MUSS immer einen ACK bekommen, egal ob Rate-Limit

3. **Validation-Fehler:**
   - Kann der initiale Heartbeat wegen fehlender/falscher Felder abgelehnt werden?
   - Pruefe welche Felder der Heartbeat-Payload haben muss und ob der Boot-Heartbeat alle hat

4. **Config-Push nach Approval:**
   - Wird nach dem Status-Wechsel `offline → online` sofort ein Config-Push getriggert?
   - Oder erst beim naechsten Heartbeat-Zyklus (120s Cooldown)?
   - Im Log kommt der Config-Push bei T=64229ms — direkt nach dem ACK. Das funktioniert. Aber nur weil der ACK erst bei T=64s kam. Wenn der ACK bei T=6s kaeme, wuerde der Config-Push dann auch sofort kommen?

---

## Fix-Auftrag — Was geaendert werden muss

Nach der Analyse, implementiere diese Fixes:

### Fix 1 (Firmware): Heartbeat-Retry nach Queue-Init

**Problem:** Der initiale Heartbeat bei T=3986ms wird moeglicherweise vor der Queue-Init gesendet und kommt nie an. Selbst wenn er ankommt, gibt es keinen Retry falls der Server nicht antwortet.

**Fix:** Nach dem Queue-Init (T=4610ms, in `setup()` oder wo die Queue erstellt wird) einen erneuten force-Heartbeat senden. Das ist eine zusaetzliche Zeile — kein Umbau.

**Pseudocode:**
```
// Nach Queue-Init:
if (!registration_confirmed_) {
    mqttClient.publishHeartbeat(true);  // force=true — Methode ist auf MQTTClient, nicht HealthMonitor
    LOG_I(TAG, "Post-queue heartbeat sent for fast registration");
}
```

### Fix 2 (Firmware): REGISTRATION_TIMEOUT_MS pruefen/reduzieren

**Problem:** Das Log zeigt ~56s Timeout. Der P9-Auftrag nennt 10s. Pruefe den aktuellen Wert.

**Fix:** Falls der Wert nicht 10000 ist, auf **10000** (10s) setzen. Das ist der Fallback falls der Server trotz allem keinen ACK schickt.

**Datei:** `mqtt_client.h:216` — Konstante `REGISTRATION_TIMEOUT_MS`

### Fix 3 (Server): ACK fuer bekannte ESPs IMMER senden

**Problem:** Der Server schickt keinen ACK auf den initialen Heartbeat. Vermutlich Discovery-Rate-Limit oder Validation-Fehler.

**Fix:** In `heartbeat_handler.py` sicherstellen, dass fuer ESPs die bereits in der DB als `approved` existieren, der ACK **immer** gesendet wird — ohne Rate-Limit, ohne Validation-Delay. Der ACK ist fuer den ESP ueberlebenswichtig (beendet den PENDING_APPROVAL State und aktiviert Sensoren/Aktoren).

**Logik:**
```python
# In heartbeat_handler — korrekter Attributname laut Code:
if esp_device and esp_device.status == "approved":
    # ACK IMMER senden, kein Rate-Limit
    await self._send_heartbeat_ack(
        esp_id=esp_id_str, status="online", config_available=True
    )
```

Nur fuer UNBEKANNTE ESPs (echter Discovery-Fall, `_discover_new_device`) darf das Rate-Limit greifen. Das Discovery-Rate-Limit greift aktuell in `_discover_new_device()` via `_discovery_rate_limiter.can_discover(esp_id)` — die approved/online-Pfade sind davon nicht betroffen. Pruefe daher zuerst ob der initiale Heartbeat ueberhaupt den `status == "approved"` Pfad erreicht oder ob er in einem anderen Branch lauft.

---

## Was NICHT geaendert werden darf

- MQTT-Topic-Struktur
- Die grundlegende Idee des Registration-Gates (Schutz vor Sensor-Spam)
- SafetyController und Emergency-Stop
- WiFi-Reconnect-Logik
- Heartbeat-Payload-Struktur
- PENDING_APPROVAL → OPERATIONAL Transition-Logik (nur der Trigger soll frueher kommen)
- HealthMonitor 60s Intervall (bleibt — nur der initiale Retry kommt dazu)

---

## Akzeptanzkriterien

- [ ] Loki-Logs zeigen: Server empfaengt initialen Heartbeat und sendet ACK innerhalb von 2s
- [ ] ESP-Serial-Log zeigt: Heartbeat-ACK kommt **vor** dem Registration-Timeout (< 10s nach Boot)
- [ ] ESP geht von PENDING_APPROVAL → OPERATIONAL in **unter 10 Sekunden** nach MQTT-Connect
- [ ] Config-Push kommt **unmittelbar** nach Approval (nicht erst nach 120s Cooldown)
- [ ] Bei einem UNBEKANNTEN ESP (echter Discovery) bleibt das Rate-Limit aktiv (kein Spam-ACK)
- [ ] Firmware kompiliert ohne Errors auf allen 3 Targets (esp32_dev, seeed_xiao_esp32c3, wokwi_esp01)
- [ ] Kein neuer Log-Spam (maximal 2 zusaetzliche Log-Zeilen beim Boot)

---

## Bericht

Erstelle nach der Analyse einen Bericht mit:

1. **Loki-Log-Auswertung:** Was hat der Server mit dem initialen Heartbeat gemacht?
2. **Root-Cause:** Warum kam kein ACK? (Server-Seite) + Warum ist der Timeout 56s? (Firmware-Seite)
3. **Fix-Details:** Genaue Dateien und Zeilennummern der Aenderungen
4. **Vorher/Nachher-Test:** Boot-Log nach dem Fix mit Timestamps

---

> Erstellt von: automation-experte Agent
> Bezug: Serial-Log ESP_EA5484 Boot 2026-03-31T21:26:11Z
> Verwandte Auftraege: R20-P9 (Registration-Gate Whitelist), ANALYSE-config-push-sht31-timing (Problem 3)
