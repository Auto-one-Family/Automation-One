# MQTT Debug Report

**Erstellt:** 2026-03-25T11:35:00Z
**Modus:** A (Allgemeine Analyse)
**Quellen:** docker logs automationone-mqtt (--since 10m), docker logs automationone-mqtt-logger (--since 10m), docker logs automationone-server (--since 12m), docker compose ps, Loki API, mosquitto_sub --retained-only, sensor_handler.py (Code-Inspektion)

---

## 1. Zusammenfassung

Der MQTT-Broker laeuft stabil. Im Beobachtungszeitraum (11:22-11:32 UTC) ist genau ein aktives ESP-Geraet aktiv: MOCK_T18V6LOGIC (Mock-Simulation). Heartbeats kommen zuverlaessig alle 60 Sekunden, ACKs folgen innerhalb von Millisekunden. Drei dokumentationswuerdige Befunde: (1) um 11:31:10 erfolgte ein Server-Reconnect mit 10 Sekunden Downtime durch Server-Neustart; (2) bei jedem Heartbeat erscheint eine leere system/will-Message im Logger-Traffic (Stale-LWT aus Broker-Persistenz); (3) der Sensor-Handler publisht nach Pi-Enhanced-Verarbeitung auf das Topic sensor/4/processed, das nicht im definierten 32-Topic-Schema enthalten ist. Ausserdem haben 6 von 9 retained Messages im Broker einen Retain-Status entgegen Schema-Vorgabe. Handlungsbedarf: mittel.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| docker logs automationone-mqtt (10m) | OK | Vollstaendig auswertbar |
| docker logs automationone-mqtt-logger (10m) | OK | Vollstaendig auswertbar |
| docker logs automationone-server (12m) | OK | Vollstaendig auswertbar |
| docker compose ps | OK | Alle 12 Services running/healthy |
| Loki API (mqtt-broker errors) | OK | Loki verfuegbar, 1 Eintrag (Fehlklassifikation) |
| mosquitto_sub --retained-only | OK (Exit 27 = Timeout nach 5s) | 8 retained Messages identifiziert |
| sensor_handler.py Code-Inspektion | OK | Publish-Pfad fuer /processed bestaetigt |

---

## 3. Befunde

### 3.1 Server-Reconnect um 11:31:10 UTC

- **Schwere:** Mittel (kurze Downtime, automatische Wiederherstellung)
- **Detail:** Client god_kaiser_server_1 trennte sich um 11:31:10Z. Reconnect um 11:31:20Z (10s Downtime). Alle 15 Subscriptions danach korrekt registriert. Ausloser: Server-Neustart.
- **Evidenz:** 2026-03-25T11:31:10Z: Client god_kaiser_server_1 disconnected / 2026-03-25T11:31:20Z: New client connected as god_kaiser_server_1
- **Bewertung:** Normales Startup-Verhalten. Reconnect-Mechanismus funktioniert korrekt.

### 3.2 Stale-LWT Leer-Message bei jedem Heartbeat (MOCK_T18V6LOGIC)

- **Schwere:** Niedrig (kein funktionaler Impact, Protokoll-Anomalie)
- **Detail:** Bei jedem Heartbeat erscheint system/will mit leerem Payload im Logger (9 Mal im Beobachtungszeitraum). Retained Leer-Message aus Broker-Persistenz, die nach Reconnect ausgespielt wird. Der lwt_handler prueft auf status=offline und verarbeitet leeren Payload nicht als Offline-Event.
- **Evidenz:** 9x in Logs: kaiser/god/esp/MOCK_T18V6LOGIC/system/will (leerer Payload)
- **Bewertung:** Kein Funktionsfehler. Bereinigung empfohlen.

### 3.3 Stale-LWT fuer ESP_00000001 und ESP_472204 (retained, beide offline seit 14 Tagen)

- **Schwere:** Mittel (korrekte Offline-Markierung, veraltete Timestamps)
- **Detail:** Zwei ESP-Geraete haben retained system/will-Messages (status=offline, reason=unexpected_disconnect). Timestamps ca. 14 Tage alt. Werden nach Server-Reconnect sofort ausgespielt und verarbeitet.
- **Evidenz:** Retained-Check bestaetigt beide Messages. Server-Log 11:31:21Z: 2x LWT WARNING.
- **Bewertung:** Protokollkonform. Bei Geraete-Loeschung retained LWTs anschliessend bereinigen.

### 3.4 Undokumentiertes Topic sensor/gpio/processed (ausserhalb 32-Topic-Schema)

- **Schwere:** Hoch (Topic ausserhalb definiertem Schema, kein dokumentierter Consumer)
- **Detail:** Der sensor_handler publisht nach Pi-Enhanced-Verarbeitung auf kaiser/god/esp/ESP_00000001/sensor/4/processed. Dieses Topic fehlt im 32-Topic-Schema. Code-Pfad: sensor_handler.py:285 via self.publisher.publish_pi_enhanced_response(). topics.py enthaelt get_sensor_processed_topic(), aber kein Server-Handler subscribed darauf.
- **Evidenz:** Logger: kaiser/god/esp/ESP_00000001/sensor/4/processed {processed_value: 22.5, unit: C, quality: good, timestamp: 1774438281}
- **Bewertung:** Schema-Inkonsistenz. Als Topic 33 dokumentieren oder Publish-Aufruf entfernen.

### 3.5 Emergency-Broadcast mit leerem Payload beim Server-Start

- **Schwere:** Keine (intentionales Verhalten)
- **Detail:** kaiser/broadcast/emergency erscheint mit leerem Payload bei Server-Start. Sicherheitsmechanismus: Server loescht damit aktiv eine eventuell vorhandene retained Emergency-Message.
- **Evidenz:** Server-Log: src.main - INFO - Cleared retained emergency-stop message from broker
- **Bewertung:** Intentionales Startup-Verhalten. Kein Problem.

### 3.6 Heartbeat-Timing MOCK_T18V6LOGIC

- **Schwere:** Keine (innerhalb Toleranz)
- **Detail:** 10 Heartbeats, Intervall exakt 60s. Kein Gap ueber 90s. ACK unter 1s. Heap-Free 43.131-49.947 Bytes. Alle Pflichtfelder vorhanden.
- **Bewertung:** Heartbeat-Flow vollstaendig OK.

### 3.7 Sensor-Daten MOCK_T18V6LOGIC

- **Schwere:** Keine
- **Detail:** Sensor-Daten alle 30s fuer GPIO 21 (SHT31): sht31_temp 22.0 Grad C, sht31_humidity 55.0%. Beide quality=good. Alle Pflichtfelder vorhanden. Server bestaetigt Persistierung.
- **Bewertung:** Sensor-Flow vollstaendig OK.

### 3.8 Subscription-Dopplung auf Emergency/Actuator-Topics

- **Schwere:** Niedrig (protokollkonform, Code-Design-Auffaelligkeit)
- **Detail:** MQTTCommandBridge (QoS 2) und Haupt-Subscriber (QoS 1) subscriben beide auf actuator/+/command, actuator/emergency, broadcast/emergency. MQTT-Protokoll: hoechste QoS gewinnt - kein funktionaler Fehler.
- **Bewertung:** Protokollkonform. Konsolidierung langfristig empfohlen.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| docker compose ps | 12 Services: alle running, 10 mit healthy-Status |
| docker logs automationone-server --since 12m | Reconnect bestaetigt, alle 15 Handler korrekt registriert |
| docker logs automationone-server (Emergency/LWT/ESP_00000001) | Emergency = Startup-Cleanup intentional; 2x LWT-Warning fuer ESP_00000001 und ESP_472204 |
| mosquitto_sub --retained-only kaiser/# -C 10 -W 5 | 8 retained Messages: 2 korrekte system/will, 1 Leer-LWT, 5 Protokoll-Verletzer |
| curl http://localhost:3100/ready | Loki verfuegbar (ready) |
| Loki {compose_service=mqtt-broker} errors | 1 Treffer: Subscription-Zeile fuer system/error - Loki-Fehlklassifikation, kein echter Broker-Error |
| Code-Inspektion sensor_handler.py:284-292 | publish_pi_enhanced_response() bestaetigt als Quelle des /processed-Topics |
| Code-Inspektion topics.py | get_sensor_processed_topic() vorhanden, fehlt in SKILL.md und MQTT_TOPICS.md |

---

## 5. Retained-Message-Inventar

| Topic | Payload-Zusammenfassung | Schema-konform? |
|-------|------------------------|-----------------|
| kaiser/god/esp/ESP_00000001/sensor/4/data | DS18B20, raw=360, value=22.5C, ts=1773230272 | NEIN - sensor/data hat retain=false |
| kaiser/god/esp/ESP_00000001/zone/ack | zone_assigned, zone_id=mock_zone | NEIN - zone/ack hat retain=false |
| kaiser/god/esp/ESP_00000001/subzone/ack | subzone_assigned, subzone_id=zeltnaerloesung | NEIN - subzone/ack hat retain=false |
| kaiser/god/esp/ESP_00000001/onewire/scan_result | 1 DS18B20 gefunden | NEIN - Topic ausserhalb Schema |
| kaiser/god/esp/ESP_00000001/system/command/response | onewire/scan OK | NEIN - Topic ausserhalb Schema |
| kaiser/god/esp/ESP_00000001/config_response | actuator config OK, 0 items | NEIN - config_response hat retain=false |
| kaiser/god/esp/ESP_00000001/system/will | offline, unexpected_disconnect, ts=1773230537 | JA - system/will retain=true korrekt |
| kaiser/god/esp/ESP_472204/system/will | offline, unexpected_disconnect, ts=1773233338 | JA - system/will retain=true korrekt |
| kaiser/god/esp/MOCK_T18V6LOGIC/system/will | Leer-Payload (Loeschmarker) | Sonderfall - wird trotzdem nach Reconnect ausgespielt |

Befund: 6 von 9 retained Messages sind Protokoll-Verletzungen. Nur system/will sollte retained sein.

---

## 6. Bewertung und Empfehlung

**Gesamtstatus: MQTT-Layer grundsaetzlich funktional und stabil. Drei aktionswuerdige Befunde.**

### Root Causes

1. Retained-Message-Proliferation: ESP_00000001 (oder aeltere Firmware-Version) hat mehrere Topics mit retain=true publisht, obwohl das Schema retain=false vorschreibt. Nach Offline-Status dauerhaft im Broker gespeichert.
2. Undokumentiertes /processed-Topic: Der sensor_handler publisht Pi-Enhanced-Ergebnisse auf ein Topic das nicht im Schema steht. Das Topic ist im Code vorhanden (topics.py), fehlt aber in der Referenz-Dokumentation.
3. Subscription-Dopplung: MQTTCommandBridge und Haupt-Subscriber subscriben beide auf Emergency/Actuator-Topics.

### Empfohlene Naechste Schritte

| Prioritaet | Massnahme | Komponente |
|-----------|-----------|------------|
| Hoch | Retained Messages bereinigen: sensor/4/data, zone/ack, subzone/ack, config_response, onewire/scan_result, system/command/response via mosquitto_pub -n -r loeschen (NUR mit User-Bestaetigung!) | Broker-Persistenz |
| Mittel | /processed-Topic als Topic 33 in SKILL.md und MQTT_TOPICS.md dokumentieren ODER publish_pi_enhanced_response() aus sensor_handler.py entfernen wenn kein Consumer vorgesehen | sensor_handler.py, topics.py, Doku |
| Niedrig | Subscription-Dopplung auf Emergency-Topics analysieren und ggf. konsolidieren | mqtt_command_bridge.py, subscriber.py |
| Info | ESP_00000001 und ESP_472204 seit 14 Tagen offline - bei Geraete-Loeschung retained LWTs anschliessend bereinigen | Broker, DB |

**SICHERHEITSHINWEIS:** Alle mosquitto_pub-Aktionen (Retained-Bereinigung) benoetigen explizite User-Bestaetigung vor Ausfuehrung.
