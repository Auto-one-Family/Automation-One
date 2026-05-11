# Beleg — AUT-344–346 Nachfolge-Findings (Stress-Test ESP_EA5484, 2026-05-11)

**Run-ID:** aut344-346-nachfolge-2026-05-11
**Datum:** 2026-05-11
**Basis:** Stack-Analyse-Bericht Robin (2026-05-11), Stress-Test ESP_EA5484, hohe Aktor-Toggle-Rate
**Status AUT-344–AUT-346:** Als erledigt markiert

---

## Zusammenfassung

AUT-344 bis AUT-346 wurden nach dem Stress-Test-Lauf als abgeschlossen markiert. Aus der detaillierten Stack-Analyse verbleiben 6 präzis belegte Folge-Probleme, die als eigenständige Linear-Issues erfasst wurden.

---

## Finding-Tabelle

| Finding-ID | AUT-Issue | Kategorie | Layer | Priorität |
|---|---|---|---|---|
| F1-TRANSPORT-TIMEOUT | Konsolidiert als Comment → AUT-344 (errno=119-Pfad additiv) + AUT-346 (Keepalive-Blockierung) | error | Firmware + Broker | HIGH |
| F2-LIFECYCLE-ENQUEUE | AUT-347 (neu erstellt) | tracing-gap | Firmware + Server | MEDIUM |
| F3-SENSOR-PUBLISH-LOSS | AUT-348 (neu erstellt) | error | Firmware + Server | MEDIUM |
| F4-SESSION-TAKEOVER | Konsolidiert als Comment → AUT-332 (Session-Takeover, kanonische Stelle) | inconsistency | Broker + Firmware | MEDIUM |
| F5-EMERGENCY-EMPTY | AUT-349 (neu erstellt) | error | Firmware + Server | LOW |
| F6-WILL-HANDLER-FALSE | AUT-350 (neu erstellt) | error | Server / DB | LOW |

---

## Log-Zitate

### F1 — Transport-Timeout unter Dauerlast

```
[FIRMWARE] MQTT_CLIENT: Writing didn't complete in specified timeout
[FIRMWARE] write_timeout_silent
[FIRMWARE] MQTT_EVENT_DISCONNECTED
[FIRMWARE] Reconnect ESP_FAIL errno=113
[FIRMWARE] COMM queue_pressure fill=6-7, hwm=7-8, shed=42-47, drop=0
[FIRMWARE] [ERROR] [SENSOR] Sensor Manager: Failed to publish sensor data GPIO 4
[MOSQUITTO] 15:37:23 UTC — Client ESP_EA5484 disconnected: exceeded timeout
[SERVER]    15:37:23 — LWT unexpected_disconnect
```

**Kontext:** errno=119 = EAGAIN/ETIMEDOUT auf ESP-IDF MQTT write. fill=6-7 von Queue-Max deutet auf gesättigte COMM-Queue hin. shed=42-47 zeigt hohe Shedding-Rate. Sensor-Publishes fallen zuerst aus, danach bricht MQTT-Transport komplett.

---

### F2 — Lifecycle-Stufen verlieren Queue-Slots

```
[FIRMWARE] [WARNING] [INTENT] Lifecycle chain-stage enqueue failed: outcome_publish_ok
  (wiederholt, intent_contract.cpp:748-754)
[SERVER]   15:33:42–15:33:49 UTC — Dropping malformed … Missing event_type
[SERVER]   15:33:28–15:34:13 UTC — intent_outcome missing intent_id
[SERVER]   15:33:28–15:34:13 UTC — unknown flow+outcome
```

**Kontext:** Outcome-Publish selbst gelingt (safePublish/publish in intent_contract.cpp:644-648), aber die nachgelagerte Chain-Stage `outcome_publish_ok` scheitert bei Queue-Druck. Resultat: halb-leere Lifecycle-Payloads am Server → Intent-Trace lückenhaft.

---

### F3 — Sensor-Publishes brechen vor MQTT-Disconnect

```
[FIRMWARE] [ERROR] [SENSOR] Sensor Manager: Failed to publish sensor data for GPIO 4
[SERVER]   15:32:34 UTC — Sensor stale ~1887–1889 s
```

**Kontext:** Sensor-Publish-Fehler erscheinen zeitlich VOR dem finalen MQTT-Disconnect (errno=119 um 15:37:23). Stale-Alarm 15:32:34 ist Folge der Auszeit. Sensor-Pfad ist erster Leidtragender bei Queue-Sättigung.

---

### F4 — `session taken over` am Broker

```
[MOSQUITTO] 15:00:08 UTC — Client ESP_EA5484 disconnected: session taken over
[MOSQUITTO] 15:32:54 UTC — Client ESP_EA5484 disconnected: session taken over
  + neuer Connect von selber IP, anderem Port
[SERVER]    LWT unexpected_disconnect (beide Male)
```

**Kontext:** Zwei Verbindungen mit gleicher Client-ID nahezu gleichzeitig. Broker trennt erste zugunsten zweiter (MQTT-Spec §3.1.4). Erzeugt zusätzliche Disconnect-Events unabhängig von Intent-Logik. Mögliche Ursachen: Reconnect vor TCP-FIN, zweiter Testclient, oder clean_session-Timing.

---

### F5 — Leerer `broadcast/emergency`-Payload

```
[FIRMWARE] [MQTTIN] len=0 tail=kaiser/broadcast/emergency
[FIRMWARE] [ERROR] Broadcast emergency parse error: EmptyInput
```

**Kontext:** Server sendet oder Retain-Cleanup hinterlässt leere Payload auf `kaiser/broadcast/emergency`. Firmware: policy=`reject_no_stop` korrekt, aber ERROR-Log und potenzielle Korrelation mit echten Emergency-Events ist irreführend. Fix-W (retain=False) laut Memory dokumentiert — Leeremission-Pfad dennoch offen.

---

### F6 — `system/will`-Handler returned False

```
[SERVER / Loki el-servador] Handler returned False for topic …/system/will
  (mindestens einmal während der Session)
```

**Kontext:** LWT-Handler gibt in mindestens einem Fall False zurück. Bei wiederholtem Disconnect/LWT kann Device-Status in DB inkonsistent bleiben: actuator_states nicht resettet, esp_devices.status nicht auf 'offline' gesetzt. Ursache unklar (SQL-Fehler, fehlende ESP-ID, Race-Condition bei Server-Restart).

---

## Verweis auf Original-Bericht

Stack-Analyse-Bericht von Robin, Stress-Test ESP_EA5484, 2026-05-11.
Vorgänger-Issues: AUT-344, AUT-345, AUT-346 (alle als erledigt markiert).
