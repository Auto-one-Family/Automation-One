# Auftrag R20-P9 — Registration-Gate Fix (MQTTClient Whitelist)

**Typ:** Bugfix — Firmware (El Trabajante)
**Schwere:** MEDIUM
**Erstellt:** 2026-03-26
**Ziel-Agent:** esp32-dev
**Aufwand:** ~1h
**Abhaengigkeit:** Keine — unabhaengig

---

## Hintergrund und Root Cause

AutomationOne ESP32-Firmware hat ein "Registration-Gate" in `MQTTClient::publish()`: Bestimmte
MQTT-Publishes werden blockiert, bis der ESP als "registriert" gilt. Ziel ist es zu verhindern
dass der ESP Sensor-Spam sendet bevor er vollstaendig initialisiert ist.

**Das Problem (R20-09):**

Beim Boot-Ablauf passiert folgendes:
- ~4.7s nach Boot: Server sendet Config-Push (MQTT-Command: configure_sensor)
- ESP verarbeitet Config-Push und sendet Config-Response zurueck
- Config-Response wird vom Registration-Gate blockiert (Gate noch nicht geoeffnet)
- Server erhaelt keine Config-Response → denkt Config-Push hat nicht funktioniert

**Konsequenz:**
1. Config-Response erreicht den Server nicht → Server denkt Config-Push hat fehlgeschlagen
2. Sensor-Daten koennen erst nach Gate-Oeffnung gesendet werden obwohl der ESP schon bereit ist

Das Registration-Gate blockiert zu viel: Es sollte System-Antworten (Config-Response,
ACKs) nicht blockieren, sondern nur moegliche Spam-Daten in der Startup-Phase.

---

## IST-Zustand

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp`

Das Registration-Gate ist event-driven mit Fallback-Timeout:
- Boolean `registration_confirmed_` wird true bei erstem Heartbeat-ACK (`main.cpp:1912` → `confirmRegistration()`)
- Fallback-Timeout: `REGISTRATION_TIMEOUT_MS = 10000` (10s) in `mqtt_client.h:138`
- Gate-Check in `MQTTClient::publish()` (`mqtt_client.cpp:541`): blockiert alle Publishes solange `registration_confirmed_ == false`
- Heartbeats sind BEREITS whitelisted (`mqtt_client.cpp:537-539`): `is_heartbeat = topic.indexOf("/system/heartbeat") != -1`

**Bestehender Code (mqtt_client.cpp:537-541):**
```cpp
bool is_heartbeat = topic.indexOf("/system/heartbeat") != -1 &&
                    topic.indexOf("/heartbeat/ack") == -1;
if (!registration_confirmed_ && !is_heartbeat) {
    // ... blockiert Publish ...
}
```

**Problem:** Config-Response und Zone/Subzone-ACKs fallen nicht unter die Whitelist und
werden in der Startup-Phase blockiert.

---

## SOLL-Zustand

### Schritt 1 — Whitelist fuer System-Antworten erweitern

Config-Response und ACK-Nachrichten vom Registration-Gate ausnehmen. Diese Topics
sollen immer sofort publiziert werden, unabhaengig vom Registrierungsstatus.

**Neue Whitelist-Eintraege:**
- `kaiser/{id}/esp/{id}/config_response` — Antwort auf Config-Push (underscore, kein Slash)
- `kaiser/{id}/esp/{id}/zone/ack` — Zone-ACK
- `kaiser/{id}/esp/{id}/subzone/ack` — Subzone-ACK

**Fix (minimaler Eingriff — 3 Zeilen in mqtt_client.cpp:537-541):**

```cpp
bool is_heartbeat = topic.indexOf("/system/heartbeat") != -1 &&
                    topic.indexOf("/heartbeat/ack") == -1;
bool is_system_response = topic.indexOf("/config_response") != -1 ||
                          topic.indexOf("/zone/ack") != -1 ||
                          topic.indexOf("/subzone/ack") != -1;

if (!registration_confirmed_ && !is_heartbeat && !is_system_response) {
    // ... bestehender Gate-Check bleibt unveraendert ...
}
```

**Wichtige Details:**
- Nur `mqtt_client.cpp` anfassen — kein anderes Modul
- Topic-Check: `"/config_response"` mit Underscore (nicht `"/config/response"` mit Slash)
- Keine neue Klasse oder Abstraktionsschicht — nur die bestehende `if`-Bedingung erweitern
- Heartbeat-Whitelist (Zeile 537-539) bleibt unveraendert

### Schritt 2 — Heartbeat-ACK Timing (Server-seitig, nur dokumentieren)

Beobachtung: Der erste Heartbeat-ACK kommt erst bei ~63s nach Boot an, obwohl das Gate
nach 10s Fallback oeffnet.

**Was der ESP korrekt macht (nicht aendern):**
- Heartbeat ist bereits whitelisted → geht sofort raus
- Erster Heartbeat nach Boot: `force=true` → sendet sofort (`main.cpp:807`)
- Gate oeffnet bei Heartbeat-ACK ODER nach 10s Fallback — beides korrekt implementiert

**Was zu pruefen ist (Server-seitig, ausserhalb dieses Auftrags):**
- `heartbeat_handler.py`: Wann sendet der Server den ACK nach einem eingehenden Heartbeat?
- Wird der erste Heartbeat nach einer Queue oder mit Delay verarbeitet?
- Das 63s-Verhalten ist ein Server-Problem, kein ESP-Problem — es blockiert diesen Fix nicht

Dieser Schritt erfordert **keine Firmware-Aenderung**. Nur als Hinweis dokumentieren
dass das Timing-Problem server-seitig zu untersuchen ist.

---

## Was NICHT geaendert werden darf

- MQTT-Topic-Struktur
- Die grundlegende Idee des Registration-Gates (Schutz vor Sensor-Spam beim Startup)
- Heartbeat-Whitelist-Logik (bereits korrekt)
- SafetyController und Emergency-Stop
- WiFi-Reconnect-Logik
- `REGISTRATION_TIMEOUT_MS` (10s — bereits korrekt)
- `confirmRegistration()` in main.cpp

---

## Akzeptanzkriterien

- [ ] Config-Response nach Config-Push kommt beim Server an, auch wenn < 10s nach Boot
      (pruefbar: Server-Log zeigt Config-ACK kurz nach Boot, nicht erst nach 10s Fallback)
- [ ] Sensor-Daten werden spaetestens 10s nach Boot gesendet (wenn WiFi + MQTT verbunden
      und kein Heartbeat-ACK vorher kam — 10s Fallback greift)
- [ ] Sensor-Daten werden sofort gesendet wenn Heartbeat-ACK vor 10s eintrifft
- [ ] Das Registration-Gate blockiert weiterhin Sensor-Daten in der Startup-Phase
      (Schutz vor Startup-Spam bleibt erhalten — nur Config-Response/ACKs sind ausgenommen)
- [ ] Firmware kompiliert ohne Errors auf allen 3 Targets (esp32_dev, seeed_xiao_esp32c3, wokwi_esp01)

---

> Erstellt von: automation-experte Agent
> Roadmap-Referenz: R20-P9, Bug R20-09 in `arbeitsbereiche/automation-one/auftraege/roadmap-R20-bugfix-konsolidierung-2026-03-26.md`
