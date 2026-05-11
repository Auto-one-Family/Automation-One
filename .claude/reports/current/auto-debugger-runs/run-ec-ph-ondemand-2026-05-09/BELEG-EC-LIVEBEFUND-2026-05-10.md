# EC On-Demand Messung — Live-Befund 2026-05-10

**Run:** run-ec-ph-ondemand-2026-05-09 (Ergänzung)  
**Datum:** 2026-05-10  
**Methode:** Docker-Logs (el-servador), ESP32 Serial-Log (direkt vom User), DB-Query, Code-Read  
**Setup:** ESP_698EB4 — EC GPIO 33, DS18B20 GPIO 4, pH GPIO 32  
**Symptom:** "Manche Messungen kamen durch, die meisten haben nicht funktioniert"

---

## Zusammenfassung der Findings

| ID | Schwere | Schicht | Kurzbeschreibung |
|----|---------|---------|-----------------|
| F1 | KRITISCH | Firmware | Guru Meditation Error — Null Pointer Dereference nach OUTBOX Exhaustion |
| F2 | KRITISCH | Firmware | MQTT Outbox Memory Exhausted (10×) → Crash-Trigger |
| F3 | HIGH | Firmware | ADC raw=0 bei erster Messung nach Restart (kein Settling) |
| F4 | HIGH | Server | ESP Disconnect-Race — Messung verloren wenn ESP während Antwort crasht |
| F5 | HIGH | Server | MEASUREMENT_BUSY 10s Cooldown erscheint als Fehler im Frontend |
| F6 | MEDIUM | Server+FW | intent_outcome 'failed' trotz gültigem Messwert (Dedup-Doppel) |
| F7 | MEDIUM | Server | EC-ATC read_failed → hard abort wenn DS18B20-Reading > 60s alt |
| F8 | LOW | MQTT | Truncated JSON auf intent_outcome Topic (Payload abgeschnitten bei char 561) |

---

## F1 — KRITISCH: Guru Meditation Error (Null Pointer Dereference)

**Quelle:** ESP32 Serial-Log, direkt vom User (Firmware-Session 2026-05-10)

**Crash-Log:**
```
E (712464) OUTBOX: outbox_enqueue(46): Memory exhausted    ← 10× in Folge
E (712466) OUTBOX: outbox_enqueue(46): Memory exhausted
...
[    697813] [ERROR   ] [ERRTRAK ] <null>

Guru Meditation Error: Core  0 panic'ed (LoadProhibited). Exception was unhandled.

Core  0 register dump:
PC      : 0x4008c40f  EXCCAUSE: 0x0000001c
EXCVADDR: 0x00000000                        ← NULL pointer dereference
A2      : 0x3fffebf0  A3      : 0x00000000

Backtrace: 0x4008c40c:0x3fffd980 0x4012c82c:0x3fffd9a0 0x4012c849:0x3fffd9c0
           0x400f7aaf:0x3fffd9e0 0x400db709:0x3fffdba0 0x400da581:0x3fffdbf0
           0x400da5f5:0x3fffdc80 0x400da620:0x3fffdca0 0x400f9709:0x3fffdcc0
           0x401189c7:0x3fffdd60

ELF file SHA256: 65a258aa083ac2ba
Rebooting...
```

**Zeitliche Einordnung:**
```
[675516ms] Manual measurement triggered GPIO 33
[675532ms] WARNING: ADC rail GPIO 33: raw=0 (floating/disconnected)
[675552ms] Manual measurement completed
[695906ms] Second measurement triggered
[695932ms] Second measurement completed
[712464ms] E OUTBOX: Memory exhausted  ← 16.5s nach zweiter Messung
[697813ms] ErrorTracker: <null>
           → Guru Meditation Error, Core 0 panic
```

**Folge im Server-Log:**
```
2026-05-10 14:25:07 - LWT received: ESP ESP_698EB4 disconnected unexpectedly
2026-05-10 14:25:07 - Device ESP_698EB4 marked offline via LWT
```

**Ursachenanalyse:**
Der Crash tritt ca. 16-20s nach den Messungen auf. Zwischen `execute_finished` und dem Crash versucht die MQTT-Outbox mehrfach, Nachrichten (Sensor-Publish, intent_outcome, Heartbeat) zu enqueuen — scheitert 10× mit "Memory exhausted". Anschließend dereferenciert ein Code-Pfad einen NULL-Pointer (EXCVADDR=0x00000000).

**Wichtig:** Der Backtrace-Code liegt bei `0x400db709` / `0x400da581` / `0x400da5f5` / `0x400da620` — diese Adressen sind ohne ELF-Auflösung nicht direkt zuordenbar, aber der Stack-Kontext (OUTBOX → MQTT-Stack) deutet auf den MQTT-Client hin.

---

## F2 — KRITISCH: MQTT Outbox Memory Exhausted

**Quelle:** ESP32 Serial-Log

**Beleg:**
```
E (712464) OUTBOX: outbox_enqueue(46): Memory exhausted
E (712466) OUTBOX: outbox_enqueue(46): Memory exhausted
E (712518) OUTBOX: outbox_enqueue(46): Memory exhausted
E (712570) OUTBOX: outbox_enqueue(46): Memory exhausted
E (712622) OUTBOX: outbox_enqueue(46): Memory exhausted
E (712675) OUTBOX: outbox_enqueue(46): Memory exhausted
E (713134) OUTBOX: outbox_enqueue(46): Memory exhausted
E (713136) OUTBOX: outbox_enqueue(46): Memory exhausted
E (713289) OUTBOX: outbox_enqueue(46): Memory exhausted
E (714208) OUTBOX: outbox_enqueue(46): Memory exhausted
```

**Heap-Status vor Crash (aus Serial-Log):**
```
[603801ms] Free heap: 49260 B, min free: 42116 B, max alloc: 38900 B
```

**Kontext:** Der ESP-IDF MQTT-Client verwendet eine interne OUTBOX für QoS-1/2 Nachrichten (PUBREC/PUBREL-Handshake). Wenn der QoS-2 Handshake blockiert ist (z.B. weil der Broker keine PUBREC zurückschickt oder die Verbindung instabil ist), wächst die OUTBOX bis zur Erschöpfung.

**Verbindung zu F1:** Wenn `outbox_enqueue` scheitert, gibt die Funktion einen Fehlercode zurück. Wenn der aufrufende Code diesen Fehlercode nicht prüft und anschließend auf den nicht-allozierten Speicher zugreift → NULL-Deref → Crash.

**Betroffene Nachrichten (Kandidaten):**
- `sensor/33/data` Publish nach Messung (QoS 2 laut Server-Config)
- `system/intent_outcome` (QoS 2)
- Heartbeat-ACK

---

## F3 — HIGH: ADC raw=0 bei erster Messung nach Restart

**Quelle:** ESP32 Serial-Log + Server-Log

**Firmware-Warnung:**
```
[675532ms] [WARNING] [SENSOR] ADC rail on GPIO 33: raw=0
           (floating/disconnected, wiring, or sensor at max Vin e.g. dry soil)
```

**Firmware-Code:** `El Trabajante/src/services/sensor/sensor_manager.cpp:1774-1779`

**Server-Ergebnis:**
```
2026-05-10 14:24:41 - [Pi-Enhanced] SUCCESS: esp_id=ESP_698EB4, gpio=33,
  sensor_type='ec' → raw=0.0 → processed=0.0 µS/cm, quality=fair
```

**DB-Nachweis:**
```sql
-- sensor_data für GPIO 33, ältere Einträge:
raw=0  → processed=0   (2026-05-09 08:26:13)
raw=0  → processed=0   (2026-05-09 08:26:00)
```

**Ursache:** EC-Sensor DFR0300 benötigt Settling-Time nach Power-On / Neustart (~800ms laut Hersteller-Spec). Die erste ADC-Messung nach dem Neustart findet den Sensor noch nicht stabilisiert. Die Firmware loggt einen WARNING, sendet aber trotzdem raw=0 an den Server. Der Server hat kein Zero-Filter für EC-Rohdaten.

**Folge:** Der User sieht 0 µS/cm im Dashboard nach dem Restart — obwohl der Sensor in Wasser ist.

---

## F4 — HIGH: ESP Disconnect-Race während aktiver Messung

**Quelle:** Server-Log docker compose logs el-servador

**Session 1 — 56s-Fenster:**
```
2026-05-10 14:12:32 Measurement triggered (a92d55f9-...)  ← Command raus
                    ... kein SUCCESS-Log für diese request_id ...
2026-05-10 14:13:28 LWT received: ESP_698EB4 disconnected unexpectedly
                    → Antwort geht verloren (56s nach Command)
```

**Session 2 — 6s-Fenster:**
```
2026-05-10 14:25:01 Measurement triggered (aaa9e356-...)  ← Command raus
                    intent_outcome lifecycle: 4× stage-Events
                    → KEIN outcome=applied, kein sensor data
2026-05-10 14:25:07 LWT received: ESP_698EB4 disconnected unexpectedly
                    → Antwort geht verloren (6s nach Command)
```

**Mechanismus:**
```
Server: publish sensor/33/command (QoS 2) → CommandBridge wartet max 15s
ESP:    empfängt Command → führt Messung aus
        → OUTBOX voll → kann Ergebnis nicht publishen
        → Crash → LWT fired
Server: CommandBridge Future läuft nach 15s ab → Frontend erhält Timeout-Fehler
        ODER: Server sieht LWT → Frontend erhält offline-Event
```

**Root Cause:** F2 (Outbox Exhaustion) blockiert die Antwort-Übermittlung. ESP crasht. Die Messung selbst wurde auf dem ESP durchgeführt, aber das Ergebnis konnte nicht zugestellt werden.

**DB-Nachweis:** Keine sensor_data-Einträge für diese request_ids.

---

## F5 — HIGH: MEASUREMENT_BUSY erscheint als Fehler im Frontend

**Quelle:** Server-Log

**Beleg — Session 2 (5 Ablehnungen in Folge):**
```
2026-05-10 14:26:53 Measurement triggered (9ca1ad2c) → SUCCESS 1773.7
2026-05-10 14:26:56 trigger_measurement rejected — measurement busy:
                    esp=ESP_698EB4 gpio=33 (2.4s since last trigger, cooldown=10.0s)
2026-05-10 14:26:58 trigger_measurement rejected — ... (4.2s, cooldown=10.0s)
2026-05-10 14:26:59 trigger_measurement rejected — ... (5.8s, cooldown=10.0s)
2026-05-10 14:27:01 trigger_measurement rejected — ... (7.7s, cooldown=10.0s)
2026-05-10 14:27:02 trigger_measurement rejected — ... (9.0s, cooldown=10.0s)
2026-05-10 14:27:08 Measurement triggered → SUCCESS 1878.0  ← nach 10s Cooldown
```

**Beleg — Session 1:**
```
2026-05-10 14:14:45 rejected — 5.1s since last trigger, cooldown=10.0s
2026-05-10 14:14:48 rejected — 8.8s since last trigger, cooldown=10.0s
```

**Code:** `El Servador/god_kaiser_server/src/services/sensor_service.py` (sensor_service.trigger_measurement)  
**HTTP-Status:** 409 Conflict mit Error-Code `MEASUREMENT_BUSY`

**Problem:** Das Frontend zeigt diesen 409-Fehler als generische Fehleranzeige ("Messung fehlgeschlagen" oder ähnlich). Der User interpretiert dies als "Messung hat nicht funktioniert" — obwohl es nur eine korrekte Ratenbegrenzung ist. Die fehlende Unterscheidung zwischen "technischem Fehler" und "zu schnell geklickt" führt zu Verwirrung.

**Verbindung zu AUT-313:** Die Measure-Button Timeout-Race Analyse (BELEG-AUT-313-FP1) adressiert den Button-State, aber nicht explizit den BUSY-Hinweis für den User.

---

## F6 — MEDIUM: intent_outcome 'failed' trotz gültigem Messwert

**Quelle:** Server-Log

**Beleg:**
```
2026-05-10 14:26:54
  intent_outcome_handler WARNING: intent_outcome missing outcome defaulted to 'unknown'
    esp_id=ESP_698EB4 intent_id=9ca1ad2c-...
  intent_outcome_handler INFO: outcome=failed  (intent_id=9ca1ad2c)
  intent_outcome_handler INFO: outcome=accepted (intent_id=9ca1ad2c)
  sensor_handler INFO: SUCCESS raw=85.0 → processed=1773.7 µS/cm
  intent_outcome_handler INFO: outcome=applied (intent_id=9ca1ad2c)
  intent_outcome_handler INFO: already_processed dedup hit (seq=37)
  intent_outcome_handler INFO: already_processed dedup hit (seq=44)
```

**Erklärung:** Der ESP hat mehrere intent_outcome-Nachrichten für dieselbe request_id gesendet, darunter eine unvollständige (kein `outcome`-Feld → defaulted to 'unknown' → interpretiert als 'failed'). Der Sensor-Datenpfad ist davon unabhängig und liefert trotzdem den korrekten Wert. Das 'failed'-Outcome kann im CommandBridge-Future vorzeitig feuern, was dem Frontend einen Fehler meldet, obwohl der Messwert kurz danach eintrifft.

**DEDUP-Hits** (seq=37, seq=44): Der ESP sendet dasselbe intent_outcome mehrfach (Retry auf QoS-Ebene oder explizit). Der Server dedupliziert korrekt, aber die Reihenfolge failed→accepted→applied ist pathologisch.

---

## F7 — MEDIUM: EC-ATC read_failed → hard abort wenn DS18B20-Reading > 60s alt

**Quelle:** Code-Read sensor_handler.py + DB-Query

**DB-Konfiguration:**
```sql
sensor_configs WHERE esp_id='ESP_698EB4':
  gpio=33, sensor_type='ec',   temp_sensor_config_id='a17b3792-...' ← gesetzt!
  gpio=4,  sensor_type='ds18b20', temp_sensor_config_id=NULL
```

**Code-Stellen:**

```python
# El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py:1011-1012
_ATC_FRESH_AGE = timedelta(seconds=5)
_ATC_STALE_AGE = timedelta(seconds=60)  ← kritische Schwelle

# Zeile 315-333: EC-Handler
atc_temp, atc_source = await self._try_get_ec_temperature(...)
if atc_source == "read_failed":
    logger.error("[EC-ATC] Temperature read failed ... aborting EC measurement")
    await self._emit_atc_read_failed_event(...)
    return True   ← HARD ABORT, kein 25°C Fallback!
```

**Kritisches Szenario (Priority 1 — explicit config):**
```
_try_get_atc_temperature() Zeile 1055-1104:
  1. sensor_config.temp_sensor_config_id = 'a17b3792' → Priority 1 aktiv
  2. Letztes DS18B20-Reading: Alter prüfen
     < 5s   → fresh (source=config:<uuid>) → EC-Messung geht durch
     5-60s  → cached_temp → EC-Messung geht durch
     > 60s  → read_failed → return (None, "read_failed") → ABORT
```

**Wann tritt das auf:**
- Nach ESP-Reconnect: DS18B20 sendet alle ~30s. Wenn der letzte Reading gerade 31s alt ist und der nächste noch nicht kam → Reading wird 31s + 30s (nächstes Intervall) = bis 61s alt → read_failed → EC-Abort.
- Im OUTBOX-Crash-Szenario (F2): Nach dem Crash reconnectet der ESP. DS18B20 braucht bis zu 30s für erstes frisches Reading. In diesem Fenster scheitern ALLE EC-Messungen lautlos.

**Heutige Logs:** Keine EC-ATC ERROR-Logs sichtbar, weil DS18B20 aktiv sendete und Readings frisch genug waren (21.25-21.38°C alle 30s). Aber dieser Pfad ist latent aktiv sobald die Kombination Reconnect+Timing-Unglück eintritt.

**DS18B20-Intervall laut heutigen Logs:** ~30s  
**read_failed-Fenster:** > 60s → entsteht z.B. bei 2 verpassten DS18B20-Readings in Folge (möglich bei Outbox-Stress)

---

## F8 — LOW: Truncated JSON auf intent_outcome Topic

**Quelle:** Server-Log

**Beleg:**
```
2026-05-10 14:12:06 - src.mqtt.subscriber - ERROR - 
  Invalid JSON payload topic=kaiser/god/esp/ESP_698EB4/system/intent_outcome
  mqtt_parse_fail_id=parse-fail:b144ce159ccf4e77a600e92f5f8ad713:
  Unterminated string starting at: line 1 column 562 (char 561)
  failure_class=mqtt_json_parse
```

**Zeitlicher Kontext:** Unmittelbar bei der EC-Messung die VOR dem ersten LWT-Disconnect (14:13:28) stattfand. Payload genau bei Byte 561 abgeschnitten.

**Hypothese:** Der ESP versucht, ein großes intent_outcome JSON zu senden (Lifecycle-Stages + Metadata), aber die MQTT-Outbox ist bereits unter Druck. Der Payload wird vom MQTT-Stack intern truncated oder mit falscher Länge veröffentlicht. Dies ist ein Frühindikator für den Outbox-Stress (F2).

---

## Korrelation: Vollständige Ereignis-Chronologie

```
13:37:18  LWT ESP_6B27C8 disconnect (unrelated — anderes Gerät)
13:56:45  ESP_698EB4 timed out (war lange offline)
13:58:04  LWT ESP_698EB4 disconnect
14:04:03  ACK timeout ESP_698EB4 zone (15s) → Config-Push fehlgeschlagen
14:04:23  sensor_schedule_ESP_698EB4_4 not found  (scheduler cleanup nach Reconnect)
14:05:29  sensor_schedule_ESP_698EB4_33 not found

14:12:06  [Messung 1] Triggered (fbd03468) → SUCCESS raw=791, 16573 µS/cm (Sensor nicht in Wasser)
          Invalid JSON auf intent_outcome (F8 — Frühindikator Outbox-Stress)
14:12:32  [Messung 2] Triggered (a92d55f9) → VERLOREN
14:13:28  LWT ESP_698EB4 disconnect (F4 — Race)

14:14:04  Nach Reconnect:
14:14:04  [Messung 3] Triggered (a9428865) → SUCCESS raw=811, 16992 µS/cm
14:14:28  [Messung 4] Triggered (6a77c591) → SUCCESS raw=87, 1822 µS/cm (Sensor in Wasser)
14:14:39  [Messung 5] Triggered (ba15f069) → SUCCESS raw=96, 2011 µS/cm
14:14:40  (Doppel-Processing von Messung 5)
14:14:45  BUSY rejected (5.1s) (F5)
14:14:48  BUSY rejected (8.8s) (F5)
14:15:04  [Messung 6] Triggered (40d5c76a) → SUCCESS raw=99, 2074 µS/cm
14:15:27  [Messung 7] Triggered (6ccfc019) → SUCCESS raw=93, 1948 µS/cm

→ Restart des ESP

14:24:41  [Messung 1 nach Restart] raw=0, processed=0.0 µS/cm, quality=fair (F3)
          Firmware: "ADC rail GPIO 33: raw=0 (floating/disconnected)"
14:25:01  [Messung 2] Triggered (aaa9e356) → VERLOREN
14:25:07  LWT disconnect (F4 — Race, nur 6s Fenster!)
          Firmware: OUTBOX Memory Exhausted ×10 → Guru Meditation Crash (F1, F2)

14:26:09  Nach Reconnect:
14:26:09  [Messung 3] SUCCESS raw=816, 17027 µS/cm (Sensor noch nicht in Wasser)
14:26:31  [Messung 4] SUCCESS raw=90, 1878 µS/cm (Sensor in Wasser)
14:26:53  [Messung 5] SUCCESS raw=85, 1773 µS/cm
          intent_outcome: failed→accepted→applied (F6)
14:26:56  BUSY rejected (2.4s) (F5)
14:26:58  BUSY rejected (4.2s) (F5)
14:26:59  BUSY rejected (5.8s) (F5)
14:27:01  BUSY rejected (7.7s) (F5)
14:27:02  BUSY rejected (9.0s) (F5)
14:27:08  [Messung 6] SUCCESS raw=90, 1878 µS/cm
```

---

## Ursachen-Hierarchie (Root Cause → Symptome)

```
F2 (OUTBOX Exhaustion)
  └─→ F1 (Firmware Crash / Guru Meditation)
       └─→ F4 (Disconnect-Race, Session 2: nur 6s Fenster)
            └─→ Messung verloren, User sieht Fehler
  └─→ F8 (Truncated JSON — Frühindikator)
  └─→ F3 (raw=0 nach Restart — kein Settling, Neustart durch Crash)

F5 (MEASUREMENT_BUSY) → unabhängig, durch schnelles Klicken
F6 (intent_outcome failed/accepted Race) → unabhängig, MQTT Retry-Storm
F7 (ATC read_failed) → latent, tritt bei Reconnect-Timing-Unglück auf
```

---

## Offene Fragen für Fix-Phase

1. **F1/F2 — Was füllt die OUTBOX?**  
   Kandidaten: (a) QoS-2 PUBREC blockiert (Server sendet kein PUBREC zurück), (b) ESP sendet zu viele Nachrichten gleichzeitig (Sensor-Data + Intent-Outcome + Heartbeat), (c) Broker-seitige Rate-Limiting. → Benötigt Broker-Log-Analyse (mqtt-debug) + ESP32 MQTT-Client Konfiguration (esp32-debug).

2. **F2 — Outbox-Größe konfiguriert?**  
   `esp-idf MQTT_OUTBOX_EXPIRED_TIMEOUT_MS` und maximale Outbox-Größe in `mqtt_client.cpp` prüfen.

3. **F7 — Design-Entscheidung ausstehend:**  
   AUT-321 hat `read_failed → hard abort` als explizite Entscheidung (kein stiller 25°C Fallback). Bei `_ATC_STALE_AGE=60s` und 30s DS18B20-Intervall entsteht ein blindes Fenster nach Reconnect. Optionen: (a) `_ATC_STALE_AGE` auf 90-120s erhöhen, (b) Reconnect-Wait für ersten DS18B20-Wert einführen, (c) Status quo akzeptieren (EC erst messen wenn Temp frisch).

---

## Zugehörige Linear-Issues

| Issue | Titel | Status |
|-------|-------|--------|
| AUT-305 | EC/pH On-Demand IST-Analyse | In Review |
| AUT-314 | Settling-Delay + Multi-Sample | Done |
| AUT-321 | temp_source cached/read_failed | In Review |
| AUT-313 | Measure-Button Timeout-Race | — |

**Neues Issue empfohlen:**  
- **F1/F2:** `[KRITISCH] ESP32 Firmware Crash — MQTT Outbox Exhaustion + Null Pointer Dereference` (Schicht: Firmware, Priorität: Urgent)
- **F3:** In AUT-314 (Settling-Delay) bereits adressiert, aber raw=0-Filter auf Server-Seite fehlt noch

---

*Erstellt: 2026-05-10 | Methode: Docker-Log + Serial-Log + DB-Query + Code-Read*
