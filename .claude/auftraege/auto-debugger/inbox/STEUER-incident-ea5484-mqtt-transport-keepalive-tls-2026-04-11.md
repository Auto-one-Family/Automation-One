---
run_mode: incident
incident_id: INC-2026-04-11-ea5484-mqtt-transport-keepalive
run_id: ""
order: incident_first
target_docs: []
scope: |
  **Problemcluster:** End-to-End MQTT/TLS-Transportabbruch und Broker-„Keepalive-Tod“ um ESP_EA5484
  (MAC EA:54:84), korreliert mit Serial-, Server- und Mosquitto-Logs aus
  `docs/analysen/BERICHT-cluster-ESP_EA5484-kalibrierung-mqtt-offline-monitoring-2026-04-11.md`
  (Abschnitte 2–3, 5, Executive Summary).

  **Gesammeltes Wissen (IST-Evidence aus Bericht, nicht als finale RC verkaufen):**
  - Serial: `MQTT_CLIENT: Writing didn't complete in specified timeout: errno=119` → danach
    `MQTT_EVENT_ERROR`, `MQTT_EVENT_DISCONNECTED`, CircuitBreaker, **ERRTRAK [3014] [COMMUNICATION]**
    „MQTT connection lost“ (Baseline nach PKG-01 korrekt; kein 6014/UNKNOWN mehr).
  - Reconnect-Pfad: `esp-tls: select() timeout`, `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`,
    erneute Disconnects; Throttle-Log `Error 3014: N occurrences suppressed in last 60s`.
  - Mosquitto: `Client ESP_EA5484 … disconnected: exceeded timeout` — konsistent mit
    nicht rechtzeitigem Ping/Keepalive oder Socket-Stall.
  - Server: `lwt_handler` `unexpected_disconnect` zum gleichen Zeitfenster (Container-Uhr
    ~2026-04-10 22:41–22:44 im Sample; mit Host-UTC abgleichen).
  - Nach 30 s Grace: `OFFLINE_ACTIVE`, Offline-Regeln (z. B. Aktor GPIO 25) — **Folge** der
    Transportunterbrechung, kein separates Root-Cause-Cluster.
  - **Hypothesen (priorisiert, im Lagebild markieren):** H1 Netz/Broker/TLS (WLAN, Broker-CPU,
    Docker-NAT 172.19.0.1); H2 clientseitige Blockade länger als Keepalive (parallel Sensorarbeit,
    Burst-Messungen — siehe separaten STEUER Kalibrierungs-Burst); H3 „zu viele Sensoren“ als
    Hauptursache **widerlegt** im Bericht (Heap ~41–57 kB frei, kein OOM-Muster).

  **Ziel dieses Laufs (Analyseauftrag → Implementierungsplan):**
  1) Korrelation **nur** mit erlaubten Schlüsseln: `esp_id` + enges Zeitfenster, MQTT-Zeilen,
     Broker-Log; HTTP `request_id` nur wenn nachgereicht — kein Vermischen ohne Fundstelle
     (auto-debugger.md 1.4, Skill Clustering-Reihenfolge).
  2) Firmware-Pfad `El Trabajante/src/services/communication/mqtt_client.cpp` (Events,
     Schreib-Timeout, Reconnect, TLS) **gegen Ist-Code** abgleichen; mqtt-debug: Broker-Policy,
     keepalive, TLS-Handshake-Zeiten.
  3) TASK-PACKAGES so schneiden, dass nach **verify-plan** ein **messbarer**
     Implementierungsplan entsteht (Backoff, QoS/Buffer, Watchdog-Interaktion nur falls belegt,
     Infrastruktur-Doku, ggf. getrennte Pakete esp32-dev / mqtt-dev / Infra-Doku ohne Code).

  **Bezug Vorgänger:** `STEUER-incident-esp32-mqtt-tls-errtrak-6014-2026-04-10.md` adressierte
  6014/UNKNOWN-Mapping; dieser Lauf setzt bei **3014** und **Transport/Timeout-Muster** an —
  Querverweis im Lagebild, keine Doppelarbeit an bereits geschlossenen PKG ohne neue Evidence.

  Ausgabe: vollständiger Ordner `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/`
  mit INCIDENT-LAGEBILD, CORRELATION-MAP, TASK-PACKAGES, SPECIALIST-PROMPTS, VERIFY-PLAN-REPORT;
  Post-Verify Mutation der Pakete/Prompts Pflicht. Keine Produkt-Implementierung durch auto-debugger.
forbidden: |
  Keine Secrets (MQTT-URI mit Credentials, Zertifikatsprivatekeys, JWT, .env) in Artefakten.
  Keine Commits auf master; Bash im Agent nur für erlaubte Git-Branch-Checks laut auto-debugger.md.
  Keine Implementierung aus TASK-PACKAGES ohne abgeschlossenes verify-plan-Gate.
  Kein Vermischen ISA-18.2 / NotificationRouter mit WS error_event ohne Evidence (Agent 1.4).
  Kein alembic upgrade/downgrade aus diesem Lauf.
done_criteria: |
  - Incident-Ordner mit allen Pflichtdateien existiert und ist konsistent benannt.
  - INCIDENT-LAGEBILD: Symptomkette Schreib-Timeout → Disconnect → Broker exceeded timeout → LWT
    als **korrelierte** Zeitleiste; Hypothesen H1–H3 mit Stütz-/Widerleg-Eintrag.
  - CORRELATION-MAP: mindestens esp_id-Zeitfenster + MQTT/Broker-Zeilen; HTTP nur wenn belegt.
  - TASK-PACKAGES: nummerierte Pakete mit Owner (esp32-dev, mqtt-dev, ggf. server-dev nur bei
    nachweislich serverseitigem Anteil), Risiko, Tests/Verifikation, Akzeptanzkriterien,
    Branch-Hinweis auto-debugger/work.
  - VERIFY-PLAN-REPORT.md nach verify-plan-Skill; danach TASK-PACKAGES und SPECIALIST-PROMPTS
    post-verify angepasst; Chat-Übergabe mit Startrolle und BLOCKERn.
---

# STEUER — Incident EA5484: MQTT-Transport, Schreib-Timeout, Keepalive/TLS

> **Chat-Start:** `@.claude/auftraege/auto-debugger/inbox/STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`  
> **Quelle (Wissensbasis):** `docs/analysen/BERICHT-cluster-ESP_EA5484-kalibrierung-mqtt-offline-monitoring-2026-04-11.md`  
> **Git:** `git checkout auto-debugger/work` vor jeder delegierten Code-Arbeit (Pflicht).

## Problemcluster (kurz)

Der sichtbare **Ausfall** ist ein **Transport-Timeout** (Schreiben auf MQTT-Socket, errno 119 im
Bericht) mit anschließendem **Broker-seitigen Session-Timeout** und **TLS-Reconnect-Fehlern**.
ERRTRAK 3014 und Offline-Policy sind **erwartbare Folgen**, nicht der Einstiegspunkt der Analyse.

## Erste Analyse (Vorarbeit für auto-debugger)

1. **Kette:** Blockade oder Netz → Schreib-Timeout → Disconnect → Mosquitto `exceeded timeout` /
   LWT — plausibel ohne zusätzliche Annahmen.  
2. **Abgrenzung:** Parallel laufender **Kalibrierungs-Mess-Burst** erhöht Last (siehe zweite STEUER);
   im Lagebild als möglicher **Verstärker** H2 verknüpfen, nicht ohne Zeitleiste mit H1 vermischen.  
3. **Code-Anker (Verify):** `mqtt_client.cpp` laut Bericht §8; Broker-Logs weiterhin
   `docker logs automationone-mqtt --since …` als pragmatischer IST-Check bis Loki-Cluster gelöst ist.

## Pflicht-Checks für SPECIALIST-PROMPTS (übernehmen)

1. **esp32-debug / esp32-dev:** Event-Reihenfolge, Timeouts, Reconnect-Backoff, parallele Publishes.  
2. **mqtt-debug:** Keepalive, `max_inflight`, TLS, Mosquitto-Timeout-Zeile zum Client.  
3. **verify-plan:** Alle PKG-Pfade und Befehle gegen Repo-Ist prüfen; BLOCKER bei fehlender
   Netz-/Broker-Evidence markieren.
