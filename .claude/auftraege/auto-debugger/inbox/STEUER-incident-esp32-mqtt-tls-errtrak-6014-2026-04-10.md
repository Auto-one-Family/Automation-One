---
run_mode: incident
incident_id: INC-2026-04-10-esp32-mqtt-tls-errtrak-6014
run_id: ""
order: incident_first
target_docs: []
scope: |
  IST-Symptom (Serial, ESP ESP_EA5484 / gleiches Verhalten auf anderen Geräten möglich):
  - MQTT_EVENT_DISCONNECTED in Schleife; CircuitBreaker [MQTT] zählt Failures.
  - esp-tls: select() timeout; TRANSPORT_BASE Failed to open a new connection: 32774;
    MQTT_CLIENT Error transport connect; esp_err=ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT
    (mqtt_event_handler in mqtt_client.cpp ~1251/1255).
  - ERRTRAK: [6014] [UNKNOWN] „MQTT connection lost“ — Kategorie UNKNOWN widerspricht
    Kommunikations-Erwartung; im Repo-Verdacht: Doppel-Offset in logCommunicationError
    (ERROR_COMMUNICATION + bereits voller Code ERROR_MQTT_DISCONNECT).
  - SafePublish failed after retry; Sensor Manager skipped publish bei MQTT down (erwartbar).
  - Optional aus Vorlauf-Logs: Schreib-Timeout auf MQTT-Socket; Heartbeat skip gpio_status
    bei niedrigem max_alloc (~38–39 KiB) — Heap-Druck als Verstärker/Nebenursache prüfen.

  Ziel dieses Laufs:
  1) Bugs und Verhaltensklassen **evidenzbasiert** trennen: (A) reine Infrastruktur/Netz/Broker/TLS,
     (B) Firmware-Logging/Observability-Fehler (6014/UNKNOWN), (C) ggf. Ressourcen/Timing
     (Heap, Reconnect-Backoff, parallele Publishes).
  2) **Code-Verifikation** in El Trabajante: mqtt_client.cpp (Events, TLS, Reconnect),
     error_tracker.cpp / error_codes.h (Kategorisierung, logCommunicationError-Aufrufer),
     CircuitBreaker, SafePublish, SensorManager publish-Pfad.
  3) Korrelation nur mit **klaren** Feldern (esp_id, Zeit, Log-Tags); HTTP/WS nur wenn
     Server- oder Frontend-Evidence vom User nachgereicht wird — kein Mischen von
     request_id mit MQTT ohne Fundstelle.

  Ausgabe: vollständiger Incident-Ordner gemäß auto-debugger-Agent inkl.
  INCIDENT-LAGEBILD.md, CORRELATION-MAP.md, TASK-PACKAGES.md, SPECIALIST-PROMPTS.md,
  VERIFY-PLAN-REPORT.md (nach verify-plan-Gate). Keine Produkt-Implementierung durch
  auto-debugger — nur scharfe Pakete und Dev-Handoff auf Branch auto-debugger/work.

  Referenz-Hypothesen (im Lagebild als Hypothesen markieren, nicht als RC verkaufen):
  - H1: TLS-Timeout = Broker nicht erreichbar, Firewall, DNS, falsche URI/Port, oder
    transientes WLAN — durch Gegenprobe (Broker-Log, Netz vom gleichen Segment) zu stützen.
  - H2: 6014 = 3000 + 3014 durch API-Missbrauch logCommunicationError(ERROR_MQTT_DISCONNECT).
  - H3: max_alloc-Knappheit verschärft MQTT/TLS; ggf. PSRAM/Buffer/Stack prüfen.
forbidden: |
  Keine Secrets (Broker-URLs mit Credentials, Zertifikats-Private-Keys, JWT, .env-Inhalte)
  in Artefakten; keine Commits auf master; keine Implementierung durch auto-debugger
  nach TASK-PACKAGES ohne abgeschlossenes verify-plan-Gate; kein alembic upgrade/downgrade;
  kein blindes „nur Server“ oder „nur ESP“ ohne Codebeleg; keine ERROR_CODES.md ändern
  ohne Abgleich mit tatsächlich gewählter Fix-Strategie (falls separates Doku-Paket).
done_criteria: |
  - `.claude/reports/current/incidents/INC-2026-04-10-esp32-mqtt-tls-errtrak-6014/`
    existiert mit allen Pflichtdateien (Lagebild, CORRELATION-MAP, TASK-PACKAGES,
    SPECIALIST-PROMPTS, VERIFY-PLAN-REPORT).
  - INCIDENT-LAGEBILD: Symptom, Zeitbezug, betroffene Schichten, **getrennte** Liste
    „bestätigte Software-Issues“ vs. „Infrastruktur/unklar“ mit Datei:Zeilen-Referenzen
    aus dem Repo (keine erfundenen Zeilen).
  - Mindestens eine **verifizierte** Ursache für [6014]/[UNKNOWN] (bestätigt oder
    widerlegt mit Codezitat) ODER als BLOCKER dokumentiert mit fehlendem Artefakt.
  - TASK-PACKAGES: nummerierte Pakete mit Owner (esp32-dev, mqtt-dev, ggf. server-dev
    nur bei Broker/Infra-Doku), Risiko, Tests/Verifikation, Akzeptanzkriterien;
    Branch-Hinweis auto-debugger/work in jedem Paket.
  - VERIFY-PLAN-REPORT.md geschrieben **nach** Anwendung verify-plan-Skill auf die
    Pakete; Post-Verify TASK-PACKAGES und SPECIALIST-PROMPTS angepasst (Pflichtsequenz
    auto-debugger).
  - Chat-Übergabe: welche Dev-Rolle startet, offene BLOCKER, keine widersprüchlichen RCs.
---

# STEUER — Incident ESP32 MQTT/TLS + ERRTRAK 6014/UNKNOWN

> **Chat-Start:** `@.claude/auftraege/auto-debugger/inbox/STEUER-incident-esp32-mqtt-tls-errtrak-6014-2026-04-10.md`  
> **Git:** Vor Schreibarbeit an Produktcode `git checkout auto-debugger/work` (Pflicht laut Agent).

## Evidence (Serial-Ausschnitt, keine Secrets)

```
MQTT_EVENT_DISCONNECTED
CircuitBreaker [MQTT]: Failure recorded (count: 1/5)
[ERRTRAK] [6014] [UNKNOWN] MQTT connection lost
[SAFETY-P4] disconnect notified (path=MQTT_EVENT)
esp-tls: select() timeout
TRANSPORT_BASE: Failed to open a new connection: 32774
MQTT_CLIENT: Error transport connect
mqtt_event_handler(): ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT
SafePublish failed after retry
Sensor Manager: MQTT not connected, skipping publish
Error 6014: 2 occurrences suppressed in last 60s
```

## Pflicht-Checks für Spezialisten (in SPECIALIST-PROMPTS übernehmen)

1. **esp32-dev / esp32-debug:** Alle Aufrufe `logCommunicationError(` und `trackError(` mit Kommunikations-Codes; Abgleich mit `ERROR_COMMUNICATION`-Baseline in `error_tracker.h`.  
2. **mqtt-debug:** Broker-Erreichbarkeit und TLS von außen dokumentieren (ohne Secrets); Mosquitto-Log-Korrelation wenn verfügbar.  
3. **verify-plan:** Pfade `El Trabajante/src/services/communication/mqtt_client.cpp`, `El Trabajante/src/error_handling/error_tracker.cpp`, `El Trabajante/src/models/error_codes.h` gegen TASK-PACKAGES prüfen.

## Optional nachgereicht durch Robin

- Vollständiger Boot-Abschnitt bis erstem Connect, `esp_id`, MQTT-URI-Schema (nur `mqtts://host:port` ohne User/Pass im Klartext im Report).  
- WiFi-RSSI zum Zeitpunkt der Disconnects.  
- Server-/Broker-Logs im gleichen Zeitfenster (UTC).
