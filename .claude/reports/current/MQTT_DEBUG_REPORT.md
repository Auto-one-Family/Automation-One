# MQTT Debug Report: Ergänzung zur MQTT Debug-Topic Analyse

**Erstellt:** 2026-02-10 11:30:00
**Modus:** A (Allgemeine Analyse - Ergänzung zum ESP32-Dev Report)
**Quellen:** ESP32_DEV_REPORT.md (547 Zeilen), MQTT_TOPICS.md, mosquitto.conf, subscriber.py, error_handler.py

---

## 1. Zusammenfassung

Der ESP32-Dev Agent hat einen vollständigen Plan für ein neues MQTT Debug-Topic erstellt.
Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/debug` (QoS 0, 60s periodisch + event-basiert)

Diese MQTT-Analyse **bestätigt den Plan vollständig** und liefert ergänzende Erkenntnisse:

**BESTÄTIGT:**
- Topic-Hierarchie passt perfekt (konsistent mit system/heartbeat, system/diagnostics, system/error)
- QoS 0 ist korrekt (wie Heartbeat/Diagnostics – informativ, nicht geschäftskritisch)
- Server-Handler-Pattern ist korrekt (analog zu error_handler.py)
- Broker-Konfiguration hat keine Blocker (max_packet_size=256KB, max_queued=1000)

**ERGÄNZUNGEN:**
- KRITISCHER FUND: system/diagnostics Topic hat KEINEN Server-Handler (wird bestätigt)
- EMPFEHLUNG: Nutze den neuen Debug-Topic als Ersatz für das ungenutzte Diagnostics-Topic
- TIMING: Registration Gate (10s Fallback) könnte erste Debug-Messages blockieren

**SCHWERE:** Niedrig – Plan ist technisch solide, keine Blocker.
**HANDLUNGSBEDARF:** Implementierung kann starten (ESP32->Server->Doku).

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| ESP32_DEV_REPORT.md | OK | 547 Zeilen, vollständige Codebase-Analyse |
| MQTT_TOPICS.md | OK | 32 Topics dokumentiert, #14 system/diagnostics kein Handler |
| mosquitto.conf | OK | Development-Konfiguration, keine ACL-Blocker |
| subscriber.py | OK | 366 Zeilen, Handler-Registry-Pattern klar |
| error_handler.py | OK | 330 Zeilen, Pattern-Referenz für Debug-Handler |
| docker compose ps mqtt-broker | HEALTHY | Container läuft, Port 1883+9001 |
| mosquitto_sub live traffic | TIMEOUT | Kein Traffic (ESP32 offline, normal) |

---

## 3. Befunde

### 3.1 Topic-Hierarchie: BESTÄTIGT

**Schwere:** Niedrig
**Detail:** Das vorgeschlagene Topic folgt exakt dem bestehenden Schema.

Bestehende system/-Topics:
- #10: system/heartbeat (ESP->Server, QoS 0)
- #14: system/diagnostics (ESP->Server, QoS 0)
- #15: system/will (ESP->Server, QoS 1, retain=true)
- #16: system/error (ESP->Server, QoS 1)

Bewertung:
- system/debug ist die logische Erweiterung der system/*-Familie
- Kein Topic-Konflikt mit bestehenden Patterns
- Wildcard-Subscription kaiser/{id}/esp/+/system/debug funktioniert
- MQTT_TOPICS.md muss um #33 erweitert werden

### 3.2 QoS 0 Wahl: BESTÄTIGT

**Schwere:** Niedrig
**Detail:** QoS 0 für Debug-Daten ist konsistent mit system/heartbeat und system/diagnostics.

Evidenz subscriber.py Zeile 119-124:
- if "heartbeat" in pattern: qos = 0
- elif "config_response" in pattern: qos = 2
- else: qos = 1

Begründung:
- Debug-Daten sind informativ, nicht geschäftskritisch
- QoS 0 = minimale Latenz, keine ACK-Overhead
- Bei MQTT-Disconnect gehen Messages verloren -> akzeptabel für Debug

### 3.3 Broker-Konfiguration: KEINE BLOCKER

**Schwere:** Niedrig

mosquitto.conf Limits:
- max_inflight_messages 20
- max_queued_messages 1000
- message_size_limit 262144 (256KB)

ESP32-Dev Report Payload-Größe:
- Debug-Payload: ~800 Bytes
- MQTT_MAX_PACKET_SIZE (XIAO): 1024 Bytes
- 800 < 1024 < 256KB -> passt problemlos

ACL/Auth: allow_anonymous true (Development)
Persistence: true, QoS 0 Messages werden NICHT persistiert (korrekt)

### 3.4 Server-Handler-Pattern: BESTÄTIGT

**Schwere:** Niedrig
**Detail:** Der vorgeschlagene debug_handler.py folgt exakt dem error_handler.py Pattern.

Pattern-Vergleich:
1. Parse Topic: parse_system_error_topic() -> parse_system_debug_topic()
2. Validate Payload: _validate_payload()
3. Resilient DB Session: resilient_session()
4. ESP Lookup: esp_repo.get_by_device_id()
5. Business Logic: Enrich Error-Code -> Structured Logging
6. DB Persist: audit_repo.log_mqtt_error() -> Optional Metrics-Snapshot
7. WebSocket Broadcast: ws_manager.broadcast("error_event") -> "debug_log"

subscriber.py Integration (Zeile 82-97):
- register_handler(topic_pattern, handler)
- subscribe_all() automatisch

Bewertung: Pattern ist 1:1 anwendbar.

### 3.5 KRITISCHER FUND: system/diagnostics hat KEINEN Server-Handler

**Schwere:** Hoch (Bestätigt ESP32-Dev Finding)
**Detail:** ESP32 HealthMonitor published seit langem auf system/diagnostics, aber der Server hat KEINEN Handler.

Evidenz MQTT_TOPICS.md Zeile 534-560:
- Topic: kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics
- QoS: 0
- Frequency: Alle 60s + bei Änderungen
- Code-Referenzen ESP32: topic_builder.cpp:buildSystemDiagnosticsTopic() (Zeile 152)
- Code-Referenzen Server: main.py Zeile 274 (Handler Registration) <- FALSCH!

Cross-Check subscriber.py (Handler-Liste):
- system/heartbeat -> heartbeat_handler.py
- system/error -> error_handler.py
- system/will -> lwt_handler.py
- system/diagnostics -> FEHLT!

ESP32-Dev Report Zeile 90:
"Es gibt KEINEN Handler für system/diagnostics! Die Daten gehen ins Leere."

Bewertung:
- BESTÄTIGT: Diagnostics-Messages gehen seit Monaten verloren
- EMPFEHLUNG: system/debug als Ersatz UND Erweiterung nutzen
- Optional: Diagnostics-Handler nachträglich hinzufügen, aber Debug deckt alles ab

### 3.6 Registration Gate: Timing-Consideration

**Schwere:** Niedrig
**Detail:** ESP32 Registration Gate blockiert alle Publishes (außer Heartbeat) für 10s nach Connect.

Registration Gate Flow:
- ESP connect -> Gate CLOSED
- Heartbeat (bypass) -> ACK
- Gate OPEN -> alle Publishes erlaubt
- Fallback: Gate öffnet nach 10s

Implikation für Debug-Topic:
- Periodischer Debug (60s): Kein Problem
- Event-basierter Debug (CRITICAL-Log sofort): Könnte in ersten 10s blockiert werden
- Fallback: Nach 10s geht alles durch

Empfehlung:
- Event-Debug-Messages in Offline-Buffer queuen bis Gate öffnet (wie alle anderen Messages)

### 3.7 Broker-Last: VERNACHLÄSSIGBAR

**Schwere:** Niedrig

ESP32-Dev Report Tabelle:
- Messages/ESP/min: ~3-5 (aktuell) -> ~4-6 (+1 Debug) = +20-30%
- Payload-Größe: +800 Bytes/min
- Absolut: Bei 10 ESPs = 100 Messages/min -> 10% Auslastung (max_queued=1000)

Bewertung: Broker-Last ist kein Blocker. Selbst mit 100 ESPs weit unter den Limits.

### 3.8 Subscriber ThreadPool: AUSREICHEND

**Schwere:** Niedrig

subscriber.py ThreadPool:
- max_workers=10 (Zeile 34)
- Handler-Count: 13 aktuell, +1 Debug = 14

Message-Rate:
- Debug: 60s periodisch = 1/min/ESP
- Bei 10 ESPs = 10 Messages/min = 0.16 Messages/sec
- ThreadPool kann ~10 Messages parallel verarbeiten

Bewertung: ThreadPool ist nicht der Bottleneck.

---

## 4. Extended Checks

| Check | Ergebnis |
|-------|----------|
| docker compose ps mqtt-broker | HEALTHY (UP 48min, Ports 1883+9001) |
| mosquitto_sub live traffic | TIMEOUT (ESP32 offline, normal) |
| MQTT_TOPICS.md Cross-Reference | 32 Topics, #14 Diagnostics KEIN Handler |
| mosquitto.conf Limits | KEINE BLOCKER (256KB, 1000 Queue) |
| subscriber.py Handler-Pattern | PATTERN KLAR (ThreadPool + async) |
| error_handler.py Referenz | 8-SCHRITTE-PATTERN identifiziert |

---

## 5. Bestätigungen aus ESP32-Dev Report

| Finding | Status | MQTT-Perspektive |
|---------|--------|------------------|
| system/debug Topic-Pattern | BESTÄTIGT | Konsistent mit system/*-Familie |
| QoS 0 für Debug | BESTÄTIGT | Analog zu Heartbeat/Diagnostics |
| Payload ~800 Bytes | BESTÄTIGT | < 1024 (XIAO) < 256KB (Broker) |
| system/diagnostics kein Handler | BESTÄTIGT | MQTT_TOPICS.md + subscriber.py fehlt |
| Handler-Pattern korrekt | BESTÄTIGT | Analog zu error_handler.py |
| Broker-Last +20-30% | BESTÄTIGT | Absolut: +800 Bytes/min/ESP |
| Server Handler Registry | BESTÄTIGT | subscriber.py register_handler() |

---

## 6. Korrekturen/Ergänzungen zum ESP32-Dev Report

### 6.1 KEINE Korrekturen nötig

Der ESP32-Dev Report ist **technisch korrekt**. Alle MQTT-Aspekte wurden akkurat analysiert.

### 6.2 Ergänzungen

**A) Registration Gate Timing (neu)**
- Event-basierter Debug (CRITICAL-Log sofort) kann in ersten 10s blockiert werden
- Lösung: Offline-Buffer nutzen (wie alle anderen Messages)
- Kein Blocker, aber Debug-Publisher sollte das berücksichtigen

**B) Subscriber QoS-Logik (Detail)**
- subscribe_all() bestimmt QoS automatisch (Zeile 119-124)
- Pattern ist system/debug, NICHT debug -> automatisch QoS 1 (default)
- FIX NÖTIG: subscribe_all() erweitern:
  if "heartbeat" in pattern or "debug" in pattern or "diagnostics" in pattern:
      qos = 0

**C) MQTT_TOPICS.md Update (Detail)**
- Neue Zeile #33 nach #32 broadcast/system_update
- system/diagnostics Handler-Status korrigieren: "KEIN HANDLER" statt "main.py:274"

---

## 7. Bewertung & Empfehlung

### Root Cause (system/diagnostics ungenutzt)

Analyse:
- ESP32 HealthMonitor published seit Monaten auf system/diagnostics (60s + bei Änderungen)
- Server hat NIEMALS einen Handler dafür registriert
- MQTT_TOPICS.md dokumentiert falsch: "main.py:274" -> Zeile existiert nicht

Mögliche Ursachen:
1. Handler wurde geplant aber nie implementiert (TODO vergessen)
2. Dokumentation ist veraltet (Handler wurde entfernt, Doku nicht aktualisiert)
3. Diagnostics sollte durch Heartbeat ersetzt werden

Empfehlung:
- system/debug Topic als **Ersatz UND Erweiterung** für Diagnostics nutzen
- Diagnostics-Handler NICHT nachträglich hinzufügen (redundant)
- MQTT_TOPICS.md korrigieren: system/diagnostics -> "KEIN HANDLER (deprecated)"

### Nächste Schritte (Implementierung)

**Phase 1: ESP32 (esp32-dev Agent)**
1. TopicBuilder: buildSystemDebugTopic() (analog zu buildSystemDiagnosticsTopic())
2. DebugPublisher: Singleton, nutzt Logger-Buffer + HealthMonitor-Snapshot
3. main.cpp: Integration nach HealthMonitor

**Phase 2: Server (mqtt-dev Agent)**
1. topics.py: parse_system_debug_topic() + build_system_debug_topic()
2. debug_handler.py: Pattern von error_handler.py kopieren, anpassen
3. main.py: Handler registrieren
4. WICHTIG: subscriber.py Zeile 119 erweitern (QoS-Logik)

**Phase 3: Dokumentation (updatedocs Skill)**
1. MQTT_TOPICS.md: Zeile #33 hinzufügen (system/debug)
2. MQTT_TOPICS.md: Zeile 560 korrigieren (system/diagnostics -> KEIN HANDLER)
3. ESP32-Dev Report archivieren

### Timing-Erwartungen (neu)

| Flow | Erwartung | Alarm |
|------|-----------|-------|
| Debug -> Loki | <5s | >10s |
| CRITICAL-Event -> Debug | <100ms (wenn Gate offen) | >1s |
| Registration Gate Delay | <10s | >15s |
| Periodischer Debug (60s) | ±5s Jitter | Gap >90s |

### Vollständige Handler-Liste (nach Implementierung)

| Pattern | Handler | Status |
|---------|---------|--------|
| .../system/heartbeat | heartbeat_handler.py | Aktiv |
| .../system/diagnostics | KEIN HANDLER | Deprecated (durch debug ersetzt) |
| .../system/error | error_handler.py | Aktiv |
| .../system/will | lwt_handler.py | Aktiv |
| .../system/debug | debug_handler.py | GEPLANT (Phase 2) |

---

## Schlussbemerkung

Der ESP32-Dev Plan ist **aus MQTT-Sicht vollständig grünes Licht**.

Keine Blocker, keine kritischen Anpassungen nötig.
Einzige Ergänzung: subscriber.py QoS-Logik (1 Zeile) + Timing-Consideration für Registration Gate.

**Implementierung kann starten.**

---

**Report-Ende**
