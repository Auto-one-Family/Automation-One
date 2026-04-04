# Paket 01: ESP32 Contract-Seedlist (P1.1)

> **Stand:** 2026-04-03  
> **Status:** Abgeschlossen (P1.1)  
> **Charakter:** Seed-Stand (grobe Contract-Skizzen, keine finale Feldvalidierung)  
> **Naechster Schritt:** Verfeinerung in P1.2/P1.3/P1.6

## Ziel

Erste belastbare Contract-Sammlung fuer die vier Pflichtketten:
1) Sensor -> MQTT Publish
2) Server Command -> ESP32 Command Handling
3) Config-Push -> Firmware Config-Verarbeitung
4) Heartbeat/Status -> Server-Rueckkanal

---

## FW-CON-001: Sensor -> MQTT Publish

- **Kette:** Sensorerfassung in `sensor_manager` -> Publish ueber `mqtt_client` -> Server `sensor_handler`
- **Topic/Kanal:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`
- **QoS:** 1
- **Payload-Schema (grob):**
  - Pflicht: `gpio`, `sensor_type`, `raw_value`, `timestamp`, `raw_mode`
  - Optional je Treiber/Modus: `value`, `unit`, `quality`, `sensor_name`, `subzone_id`, `onewire_address`, `i2c_address`
- **Contract-Bedingungen:**
  - `raw_mode` muss fuer server-zentrische Verarbeitung konsistent gesetzt sein.
  - `timestamp` darf 0 sein (frueher Boot/NTP nicht synchron), Server muss fallbacken.
  - Topic muss ueber `TopicBuilder` gebaut werden.
- **Fehlerfall bei Verletzung:**
  - Fehlende Pflichtfelder -> Server kann Message verwerfen oder als fehlerhaft markieren.
  - Falsches Topic -> Datenverlust durch fehlenden Handler.
  - Falscher QoS -> erhoehte Verlustwahrscheinlichkeit.
- **Folgepaket fuer Detailanalyse:** P1.3 und P1.6

---

## FW-CON-002: Server Command -> ESP32 Command Handling

- **Kette:** Server publish command -> `mqtt_client` callback/router -> Core-Queue -> `actuator_manager`/`sensor_manager`
- **Topics/Kanaele (Kern):**
  - `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command`
  - `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command`
  - optional emergency/system: `.../actuator/emergency`, `.../system/command`
- **QoS:** command-seitig 2 (laut Referenz), responses/status meist 1
- **Payload-Schema (grob, actuator command):**
  - Pflicht: `command`
  - Optional: `value`, `duration`, `source`, `correlation_id`
- **ESP32-Responsekanaele:**
  - `.../actuator/{gpio}/response`
  - `.../actuator/{gpio}/status`
  - `.../sensor/{gpio}/response`
- **Contract-Bedingungen:**
  - Safety-kritische Commands duerfen nicht direkt auf falschem Core ausfuehren (Queue-Route einhalten).
  - `duration` semantics konsistent (Auto-Off nur bei `>0`).
  - `correlation_id` fuer End-to-End Nachverfolgung durchreichen, wenn vorhanden.
- **Fehlerfall bei Verletzung:**
  - Core-Race bei Direktaufruf -> inkonsistente Aktor-/Sensorzustande.
  - Fehlende/ungueltige Commandfelder -> command rejected, Aktor bleibt unveraendert oder fail-safe.
  - Fehlende Response -> Server kann State nicht sicher korrelieren.
- **Folgepaket fuer Detailanalyse:** P1.2, P1.5, P1.6

---

## FW-CON-003: Config-Push -> Firmware Config-Verarbeitung

- **Kette:** Server publish config -> `mqtt_client` empfängt -> `config_update_queue` -> Core1 Parser/Handler -> `config_manager`/`sensor_manager`/`actuator_manager`/`offline_mode_manager`
- **Topic/Kanal:** `kaiser/{kaiser_id}/esp/{esp_id}/config`
- **ACK-Kanal:** `kaiser/{kaiser_id}/esp/{esp_id}/config_response`
- **QoS:** 2 fuer config und config_response
- **Payload-Schema (grob):**
  - Meta: `config_id` (oder aequivalente Korrelation)
  - Sektionen: `wifi`, `system`, `sensors[]`, `actuators[]`, optional `offline_rules[]`, zone/subzone Konfigurationen
- **Contract-Bedingungen:**
  - Parsing zentralisiert und einmalig je Payload (Queue-Pfad, keine parallelen Mehrfach-Deserialisierungen).
  - Anwenden der Konfig auf Core 1 fuer Sensor/Aktor-Owner-Konsistenz.
  - Bei Teilfehlern muss `config_response` differenzierte Fehlerdetails tragen.
- **Fehlerfall bei Verletzung:**
  - Queue Overflow/Bypass -> Config-Verlust oder Data-Race.
  - NVS-Schreibfehler -> inkonsistenter Neustartzustand.
  - Fehlendes ACK -> Server kennt Applied-State nicht.
- **Folgepaket fuer Detailanalyse:** P1.2, P1.4, P1.6

---

## FW-CON-004: Heartbeat/Status -> Server-Rueckkanal

- **Kette:** ESP Heartbeat publish -> Server verarbeitet + sendet ACK -> ESP aktualisiert ACK-/Offline-State
- **Topics/Kanaele:**
  - Publish: `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat` (QoS 0)
  - ACK: `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack` (QoS 1)
  - Ergaenzend: `kaiser/{kaiser_id}/server/status` fuer LWT/Serverzustand
- **Payload-Schema (grob, heartbeat):**
  - Pflicht: `esp_id`, `status/state`, `ts`/timestamp, Basisdiagnostik
  - Optional: `sensor_count`, `actuator_count`, config-status, health-Felder
- **Contract-Bedingungen:**
  - ACK muss die Tracking-Felder enthalten, die Offline-Logik fuer Timeout-Reset benoetigt.
  - Reihenfolge relevant: ACK-Handling darf nicht hinter langlaufender Verarbeitung verschwinden.
  - Disconnect/ACK-Timeout muss mit OfflineMode-State-Machine konsistent verzahnt bleiben.
- **Fehlerfall bei Verletzung:**
  - Ausbleibender oder inkonsistenter ACK-Pfad -> false Offline-Aktivierung oder verspaetete Safety-Reaktion.
  - Heartbeat-Topic-Drift -> Server-Registrierung/Monitoring unzuverlaessig.
- **Folgepaket fuer Detailanalyse:** P1.2, P1.5, P1.6

---

## Querschnittsannahmen (Seed-Stand)

- Topic-Kontrakte werden ausschliesslich ueber `TopicBuilder` konstruiert.
- ESP32 bleibt ausfuehrender Agent, server-zentrische Entscheidungslogik bleibt auf El Servador.
- Config-/Command-Pfade muessen Multi-Core-safe ueber Queues und klaren Owner-Core laufen.

## Offene Contract-Punkte fuer Folgepakete

1. Exakte Pflichtfelder inkl. Typ und Grenzwerte pro Payload (P1.3/P1.6).
2. ACK-Korrelation (`correlation_id`) und Timeout-Semantik ueber alle Command-Arten (P1.2/P1.6).
3. Fehlercode-Schema bei Config-Teilfehlern (`config_response`) inkl. Wiederholungslogik (P1.2/P1.6).
4. Heartbeat-ACK-Felder und Reset-Logik fuer Offline-State-Machine (P1.2/P1.5).

## Kurzfazit

Die vier Pflichtketten sind fuer die weitere Tiefenanalyse sauber aufgesetzt und koennen jetzt in P1.2 (Zustaende/Trigger) und P1.3 (Sensorpfad) formalisiert werden.
