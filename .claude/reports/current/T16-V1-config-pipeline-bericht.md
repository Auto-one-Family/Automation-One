# T16-V1 — Config-Pipeline + MQTT Deep-Dive

**Datum:** 2026-03-10
**Typ:** Verifikationsauftrag
**Status:** ABGESCHLOSSEN — 5 FAIL, 4 PARTIAL, 3 PASS

---

## Zusammenfassung

| Block | PASS | PARTIAL | FAIL | Kritischster Befund |
|-------|------|---------|------|---------------------|
| A — Config Mismatch | 0 | 3 | 2 | Zone-Assign-Loop alle 2min mit ACK-Timeouts |
| B — Duplikat-Fix | 1 | 1 | 2 | **UNIQUE Constraint nicht deployed!** Migration nie angewandt |
| C — MQTT Pipeline | 2 | 0 | 1 | 993 historische Duplikat-Gruppen aktiv |
| **Gesamt** | **3** | **4** | **5** | |

### Top-3 Befunde (absteigend nach Prioritaet)

1. **KRITISCH:** Alembic-Migration `add_sensor_data_dedup` nie angewandt. UNIQUE Constraint fehlt auf `sensor_data`. 993 Duplikat-Gruppen in 7136 Zeilen (~14%). Neue Duplikate entstehen weiterhin.
2. **HOCH:** Zone-Assign-Loop: Server sendet alle ~2min `zone/assign` an ESP_472204 mit 15s ACK-Timeout. 18 Sends + 36 Timeouts in 6h. Root Cause: ESP meldet `zone_assigned: false` trotz vorheriger ACK-Bestaetigung.
3. **HOCH:** Config-Mismatch-Trigger ist **Actuator-Count** (ESP=0, DB=1), nicht Sensor-Count. ESP persistiert Aktuator-Config nicht ueber Heartbeat-Zyklen hinweg.

---

## Block A — Config Mismatch Loop

### V-CM-01: Heartbeat-Payload analysieren — PARTIAL

**Befunde:**
- ESP_472204 Heartbeat-Payload (aus Firmware-Analyse `mqtt_client.cpp:715-758`):

| Feld | Wert | Quelle |
|------|------|--------|
| `sensor_count` | 18 | `sensorManager.getActiveSensorCount()` — aktive RAM-Slots |
| `actuator_count` | 0 | `actuatorManager.getActiveActuatorCount()` — aktive RAM-Slots |
| `zone_assigned` | false | `zoneManager.isAssigned()` |
| `zone_id` | "" | Leer wenn nicht assigned |
| `gpio_status[]` | Array | Reservierte GPIOs mit owner/component |
| `config_status.state` | 3 | ESP-State (RUNNING) |

- **DB hat:** 2 sensor_configs (sht31_temp + sht31_humidity, GPIO 0, enabled=true) + 1 actuator_config (GPIO 27)
- **ESP meldet:** sensor_count=18, actuator_count=0

**Root Cause sensor_count=18:** ESP zaehlt ALLE `active=true` Slots im RAM. Nach mehrfachem Config-Push ohne vorherigen Reset akkumulieren sich Eintraege. SHT31 zaehlt als 2 (temp+humidity). MAX_SENSORS in Firmware muesste >= 18 sein.

**Akzeptanz:**
- [x] Heartbeat-Payload vollstaendig dokumentiert
- [x] Klarheit: ESP meldet aktive RAM-Slots, nicht Hardware-Kapazitaet
- [x] Exact Match: ESP=18/0, DB=2/1

---

### V-CM-02: Mismatch-Logik im heartbeat_handler tracen — FAIL

**Befunde:**
- Mismatch-Bedingung (`heartbeat_handler.py:1250-1251`):
  ```python
  needs_sensor_push = esp_sensor_count == 0 and db_sensor_count > 0
  needs_actuator_push = esp_actuator_count == 0 and db_actuator_count > 0
  ```
- Bei ESP_472204: `esp_sensor_count=18` (nicht 0) → `needs_sensor_push = False`
- **ABER:** `esp_actuator_count=0` und `db_actuator_count=1` → `needs_actuator_push = True`
- **Der Trigger ist der Aktuator-Mismatch**, nicht der Sensor-Mismatch!
- Log-Nachricht ist irrefuehrend: zeigt alle Counts, triggert aber nur wegen Aktuator

**Root Cause:**
Der Vergleich `== 0` ist korrekt fuer Post-Reboot-Erkennung. Das Problem: ESP empfaengt Aktuator-Config (ACK bei 09:06:59), meldet aber im naechsten Heartbeat wieder `actuator_count: 0`. Die Firmware persistiert die Aktuator-Anzahl nicht korrekt in den Heartbeat-Payload.

**Parallel:** Zone-Resync-Logik (`heartbeat_handler.py:711-795`) feuert ebenfalls weil `zone_assigned: false` im Payload steht, obwohl Zone-ACK kam.

**Fix-Empfehlung:**
1. **Kurzfristig:** Cooldown auf `_auto_push_config()` wie bei Zone-Resync (60s). Aktuell: kein Cooldown → feuert bei jedem Heartbeat.
2. **Mittelfristig:** ESP-Firmware: Aktuator-Count und Zone-Assignment im NVS persistieren und im Heartbeat korrekt melden.
3. **Langfristig:** Count-basierte Mismatch-Detection durch Typ+GPIO-Vergleich ersetzen.

**Akzeptanz:**
- [x] Mismatch-Vergleichslogik dokumentiert (Zeile 1250-1251)
- [x] Root Cause: Aktuator-Count Mismatch (nicht Sensor-Count)
- [x] Empfehlung vorhanden

---

### V-CM-03: Config-Push + ACK-Fluss tracen — PARTIAL

**Befunde:**

| Aspekt | Detail |
|--------|--------|
| Config-Push-Topic | `kaiser/god/esp/ESP_472204/config` |
| Config-Push-Payload | 2 sensors + 1 actuator (via ConfigPayloadBuilder) |
| Zone-Assign-Topic | `kaiser/god/esp/ESP_472204/zone/assign` |
| ACK-Wait-Topic | MQTTCommandBridge wartet auf `kaiser/god/esp/ESP_472204/zone/assign` ACK |
| ACK-Timeout | 15.0s (DEFAULT_TIMEOUT) |

**Config-ACK:** ESP sendet `config_response` auf Topic `kaiser/god/esp/{esp_id}/config_response` — das ist KEIN ACK im Bridge-Sinne. Die Bridge wartet nicht auf Config-Response, nur auf Zone-ACK.

**Zone-ACK:** ESP implementiert Zone-ACK auf `kaiser/god/esp/{esp_id}/zone/ack`. Bei 09:06:59 kam ein Zone-ACK. Danach nie wieder (ESP ignoriert wiederholte Zone-Assigns weil bereits assigned).

**ESP-Firmware Config-ACK:** Teilweise implementiert.
- `config_response` Topic: Ja (Verarbeitungsergebnis)
- Zone-ACK: Ja (einmalig nach erster Zuweisung)
- Subzone-ACK: Ja
- Config-Push-ACK (im Bridge-Sinne): Nein

**Akzeptanz:**
- [x] Config-Push-Topic und Payload dokumentiert
- [x] ACK-Topic dokumentiert
- [x] Config-ACK: Teilweise (config_response ja, Bridge-ACK nein)
- [ ] Loop-Unterbrechung: Nur durch Cooldown oder Firmware-Fix

---

### V-CM-04: Auswirkungen der Mismatch-Kaskade messen — FAIL

**Befunde (6h-Fenster 04:00-10:00 UTC):**

| Metrik | Wert | Bewertung |
|--------|------|-----------|
| Zone-Assign-Sends | 18 | ~3/h (60s Cooldown wirkt) |
| ACK-Timeouts | 36 | 2 pro Send (Zone + Subzone) |
| Config-Pushes | mind. 2 (aus Logs) | Feuert bei jedem HB mit actuator_count=0 |
| DB-Seiteneffekte | Nein | Config-Push ueberschreibt DB nicht |
| ESP offline seit | 09:41:40 UTC | LWT received: unexpected_disconnect |

**Kaskaden-Timeline (09:06 - 09:42 UTC):**
```
09:06:59  Zone-ACK + Subzone-ACK + Config-Response ✓ (ESP frisch gestartet)
09:08:04  Config mismatch: sensors=18/actuators=0 vs DB 2/1 → Push + Zone-Assign
09:10:39  Zone-Assign (Cooldown abgelaufen)
09:12:41  Zone-Assign
...       (alle ~2min weiter)
09:35:39  Zone-Assign → ACK-Timeout 15s
09:37:39  Zone-Assign → ACK-Timeout 15s
09:39:39  Zone-Assign → ACK-Timeout 15s
09:41:40  LWT: ESP disconnected unexpectedly
09:41:41  Zone-Assign an OFFLINE ESP (!) + Config-Push an offline ESP
```

**Performance-Impact:** Moderat. 36 blockierende 15s-Futures in 6h = 540s = 9 Minuten kumulative Wartezeit. Kein CPU-Spike aber asyncio-Task-Backlog.

**Kritisch:** Server sendet Zone-Assign + Config-Push an OFFLINE ESP ohne Pruefung! `esp_service.py` loggt nur Warning: "Sending config to offline device".

**Akzeptanz:**
- [x] Zone-Sends: 18 in 6h (~3/h)
- [x] ACK-Timeouts: 36 in 6h (~6/h)
- [x] DB-Seiteneffekte: Nein
- [x] Performance-Impact: Messbar (540s kumulative Timeout-Wartezeit)

---

### V-CM-05: Heartbeat-Handler fuer MOCK-ESP pruefen — PARTIAL

**Befunde:**
- MOCK_24557EC6: Status `online`, SAFE_MODE, last_seen 10:06:13 UTC
- Heartbeats: alle 15s (AUTO-HB Scheduler, nicht echter MQTT)
- **sensor_configs: 0** (keine Sensoren konfiguriert)
- **sensor_data: 0 Rows** in letzten 2h

**Mismatch-Verhalten:**
- `esp_sensor_count=0` UND `db_sensor_count=0` → `needs_sensor_push = False`
- Kein Mismatch, kein Config-Push-Loop fuer MOCK

**SAFE_MODE:** Server sendet KEINE Zone-Assigns an Mock (kein Zone-Assign-Log fuer MOCK in 6h). SAFE_MODE wird korrekt behandelt.

**Akzeptanz:**
- [x] Mock-Heartbeat: AUTO-HB alle 15s, SAFE_MODE
- [x] Mismatch: kein Loop (0 configs = kein Mismatch)
- [x] SAFE_MODE: korrekt behandelt, keine Zone-Assigns

---

## Block B — SHT31-Duplikat-Fix Retest

### V-DUP-01: UNIQUE Constraint verifizieren — FAIL

**Befunde:**
- **UNIQUE Constraint `uq_sensor_data_esp_gpio_type_timestamp` FEHLT auf sensor_data!**
- Alembic-Version in DB: `add_device_scope_and_context`
- Migration `add_sensor_data_dedup` existiert im Code aber wurde NIE angewandt
- sensor_data hat nur Standard-Indexes (PK, FK, btree auf esp_id/gpio/timestamp)

**Verifikation:**
```
\d sensor_data → Kein UNIQUE Constraint ausser PK auf id
pg_constraint WHERE contype='u' → 0 Rows
```

**Root Cause:** Nach dem Server-Rebuild (`docker compose up -d --build el-servador`) wurde `alembic upgrade head` nicht ausgefuehrt. Die Migration existiert als Python-Datei, wurde aber nie gegen die laufende DB ausgefuehrt.

**Fix:** `alembic upgrade head` ausfuehren. Die Migration bereinigt auch bestehende Duplikate.

**Akzeptanz:**
- [ ] UNIQUE Constraint existiert — **NEIN, FEHLT**
- [ ] Manueller Duplikat-Insert ignoriert — Nicht testbar ohne Constraint

---

### V-DUP-02: Keine neuen Duplikate seit Fix — FAIL

**Befunde:**
- **1 neues Duplikat in letzten 2h:** sht31_temp bei 09:06:37 (cnt=2)
- Duplikate entstehen weiterhin weil UNIQUE Constraint fehlt
- `sensor_repo.save_data()` nutzt Try/Except auf IntegrityError — greift nicht ohne Constraint!

**Code-Analyse (`sensor_repo.py:302-313`):**
```python
try:
    session.add(sensor_data_obj)
    await session.flush()
except IntegrityError:
    await session.rollback()
    logger.debug("Duplicate sensor_data ignored: ...")
    return None
```
Ohne den DB-Constraint gibt es keinen IntegrityError → Duplikate werden normal gespeichert.

**Wachstumsrate:**
- 388 Rows in letzten 2h
- Bei 2 Sensor-Typen × 30s Intervall × 2h = erwartete 240 unique Rows
- 388 / 240 = **1.6x** → ca. 60% mehr Rows als erwartet (Mix aus Duplikaten + QoS-Redelivery)

**Akzeptanz:**
- [ ] 0 Duplikate — **NEIN, 1 neues Duplikat nachgewiesen**
- [ ] Wachstumsrate ~120/h — **NEIN, ~194/h (1.6x hoeher)**

---

### V-DUP-03: Altdaten-Bereinigung pruefen — PARTIAL

**Befunde:**
- **993 Duplikat-Gruppen** in sensor_data
- Gesamtzahl: **7136 Rows**
- Bei 993 Duplikat-Gruppen mit je 2 Rows: ~993 ueberfluessige Rows (14% der Tabelle)
- Cleanup wurde NICHT ausgefuehrt (Migration nie applied)
- Alle Duplikate stammen von ESP_472204 (einziges Geraet mit Sensordaten)

**Zeitliche Verteilung der Duplikate (Stichprobe):**
```
07:36:13 — sht31_temp + sht31_humidity (je 2x)
07:37:13 — sht31_temp + sht31_humidity (je 2x)
07:38:13 — sht31_temp + sht31_humidity (je 2x)
07:38:43 — sht31_temp + sht31_humidity (je 2x)
...
09:06:37 — sht31_temp (2x)
```

**Pattern:** Duplikate treten in Clustern auf (um :13 und :43 Sekunden), was auf QoS-1-Redelivery alle 30s hinweist.

**Akzeptanz:**
- [ ] Historische Duplikate: 0 — **NEIN, 993 Gruppen**
- [x] sensor_data Gesamtzahl: 7136 Rows dokumentiert

---

### V-DUP-04: Sensor-Datenfluss E2E verifizieren — PASS

**Befunde:**

| Sensor | Letzte Werte | Bereich | Plausibel |
|--------|-------------|---------|-----------|
| sht31_temp | raw=24696, processed=20.9°C | 20.6-21.0°C | Ja |
| sht31_humidity | raw=26282, processed=40.1%RH | 40.1-40.3%RH | Ja |

- Beide Sensor-Typen liefern Daten im ~30s-Takt (letzte 10 Punkte: 09:40:37 bis 09:42:37)
- `raw_value` UND `processed_value` vorhanden (kein NULL)
- `quality = 'good'` fuer alle Datenpunkte
- Pi-Enhanced Processing aktiv: raw → processed korrekt konvertiert
- **ESP offline seit 09:42:37** → keine neuen Daten seitdem

**Akzeptanz:**
- [x] Beide Sensortypen im 30s-Takt
- [x] raw_value UND processed_value vorhanden
- [x] quality = 'good'
- [x] Werte plausibel (Temp ~20.9°C, Humidity ~40.1%)

---

## Block C — MQTT-Bridge + Reconnect-Verhalten

### V-MQ-01: MQTT-Bridge Connection-Status — PASS

**Befunde:**
- MQTT connected at 09:06:58: `result code: 0` (SUCCESS)
- `MQTTCommandBridge initialized (client_connected=True, broker=mqtt-broker:1883)`
- Circuit Breaker `mqtt`: initialized → manual reset → **closed** (gesund)
- Circuit Breaker `database`: initialized → **closed**
- Keine Disconnect-Events fuer den Server-MQTT-Client in 6h
- `client_connected=True` in allen 18 Zone-Command-Logs

**Akzeptanz:**
- [x] MQTT-Bridge connected = True
- [x] Circuit Breaker mqtt = closed
- [x] Keine MQTT-Disconnect-Events

---

### V-MQ-02: QoS-1-Redelivery nach Fix-6.0 — FAIL

**Befunde:**
- ON CONFLICT Schutz **nicht aktiv** (Constraint fehlt, siehe V-DUP-01)
- IntegrityError-Catch in `sensor_repo.save_data()` greift nicht ohne Constraint
- Redelivery-Messages werden **NICHT verworfen** → erzeugen Duplikate
- QoS-Level fuer Sensor-Data: **QoS 0** laut ESP-Firmware (`mqtt_client.cpp` Heartbeat) — ABER die Duplikat-Pattern (0s/1s Gaps) deuten auf mehrfache Processing-Aufrufe im Server hin, nicht MQTT-Redelivery

**Duplikat-Pattern-Analyse:**
```
07:38:13 — sht31_temp (2 Rows mit gleicher Timestamp)
07:38:43 — sht31_temp (2 Rows mit gleicher Timestamp)
```
Gap-Analyse zeigt: 0s-Gaps = exakt gleiche Timestamps. Das ist NICHT QoS-1-Redelivery (die haette leicht unterschiedliche Server-Timestamps). Das deutet auf **doppelte Handler-Aufrufe** im Server hin (MQTT-Client ruft Handler 2x pro Message auf, oder Wildcard-Subscription matched doppelt).

**Fix-Empfehlung:**
1. `alembic upgrade head` ausfuehren (Constraint + Cleanup)
2. MQTT-Subscription-Pattern pruefen: Gibt es doppelte Subscriptions auf Sensor-Data-Topics?

**Akzeptanz:**
- [ ] Redelivery korrekt verworfen — **NEIN (Constraint fehlt)**
- [ ] Kein Error-Log bei Redelivery — **N/A (kein Schutz aktiv)**
- [x] QoS-Level: 0 fuer Heartbeat (Sensor-Data ebenfalls QoS 0 laut Firmware)

---

### V-MQ-03: ESP-Daten-Gap Investigation — PASS

**Befunde:**
- **1 signifikanter Gap:** 197s (3.3 Minuten) bei 07:41:49 → 07:45:06
- Sonst keine Gaps > 120s in 6h-Fenster
- ESP_472204 Datenspan: 07:33:05 bis 09:42:37 (2.16h, 587 Rows, 286 unique Timestamps)
- ESP ging um 09:41:40 offline (LWT: unexpected_disconnect)

**Gap-Korrelation:**
- Der 197s-Gap um 07:41-07:45 korreliert mit keinem sichtbaren Server-Event (kein Disconnect, kein Error)
- Vermutlich Firmware-seitiger Sensor-Publishing-Stall (temporaer)
- Kein 12h-Gap wie in T15-V2 berichtet — das Problem ist aktuell NICHT reproduzierbar

**Akzeptanz:**
- [x] Daten-Gaps > 120s: 1x (197s bei 07:41-07:45)
- [x] Kein anhaltendes Gap-Problem (nur einmaliger 3min Stall)
- [x] Empfehlung: Server-Watchdog fuer "Heartbeat ohne Daten > 5min"

---

## Fix-Empfehlungen (priorisiert)

### KRITISCH — Sofort

| # | Fix | Aufwand | Wirkung |
|---|-----|---------|---------|
| 1 | `alembic upgrade head` ausfuehren | 5min | Constraint + Cleanup der 993 Duplikat-Gruppen |
| 2 | Verify: Laeuft Alembic Auto-Upgrade bei Container-Start? | 15min | Verhindert zukuenftige Migration-Luecken |

### HOCH — Naechste Session

| # | Fix | Aufwand | Wirkung |
|---|-----|---------|---------|
| 3 | Cooldown auf `_auto_push_config()` (60s, analog Zone-Resync) | 30min | Stoppt Config-Push-Spam bei jedem Heartbeat |
| 4 | Online-Check vor Zone-Assign/Config-Push | 30min | Keine Commands an offline ESPs |
| 5 | MQTT-Subscription-Audit: Doppelte Subscriptions pruefen | 1h | Root Cause der Duplikate klaeren |

### MITTEL — Naechste Phase

| # | Fix | Aufwand | Wirkung |
|---|-----|---------|---------|
| 6 | ESP-Firmware: Actuator-Count + Zone-Assignment persistent | 2h | Eliminiert Mismatch-Loop dauerhaft |
| 7 | Server-Watchdog: "Heartbeat ohne Daten > 5min" | 1h | Fruehe Erkennung von Firmware-Stalls |
| 8 | Mismatch-Detection: Count → Typ+GPIO Vergleich | 2h | Praezisere Erkennung, weniger False Positives |

---

## Anhang: ESP-Geraete-Status

| Device | Status | Last Seen | Zone | Sensor Configs | Sensor Data |
|--------|--------|-----------|------|----------------|-------------|
| ESP_472204 | offline | 09:42:37 | Zelt Wohnzimmer | 2 (SHT31) | 587 Rows (6h) |
| MOCK_24557EC6 | online (SAFE_MODE) | 10:06:13 | Wokwi Testzone | 0 | 0 Rows |
| ESP_00000001 | offline | 2026-03-09 14:32 | Wokwi Testzone | - | - |
