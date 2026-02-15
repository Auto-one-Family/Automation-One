# Auftrag an @server-dev / @system-control
Datum: 2026-02-10 05:00

> **[verify-plan Korrektur]** Agent-Scope: Dieser Auftrag spannt über ALLE Layer (ESP32 Firmware, MQTT, Server, Frontend, Docker). `@server-dev` kann nur Python/Server-Code analysieren. Empfehlung: Hauptauftrag an `@server-dev` für Server-seitige Analyse (Log-Formate, Metriken, DB-Schema, Handlers), ergänzende Teilaufträge an `@esp32-dev` (Firmware Log-Formate, Serial-Output-Struktur, Conditional Compilation) und `@frontend-dev` (Frontend-Logging, WebSocket-Events). `@system-control` für Docker/Infra-Status.

## Context

AutomationOne baut schrittweise eine KI-gestützte Debug-Infrastruktur auf. Auf einem NVIDIA Jetson Orin Nano Super werden perspektivisch 8 ML-Methoden laufen, die das System intelligent überwachen (Log-Klassifikation, Anomalie-Erkennung, Cross-Layer-Korrelation, Sequenz-Pattern-Mining, Predictive Failure, Metrik-Korrelation, Log-Clustering, Drift Detection).

**DIESER AUFTRAG ist NICHT die ML-Implementierung.** Es geht um die VORBEREITUNG: Wir müssen JETZT die Datengrundlage so strukturieren, dass die ML-Modelle später sauber trainiert werden können. Jedes gelöste Problem, jeder Log-Eintrag, jede Metrik wird zum Trainingsdatensatz – aber nur wenn die Daten von Anfang an richtig strukturiert, gelabelt und katalogisiert sind.

**Was existiert bereits:**
- Monitoring-Stack läuft: Loki (Logs), Prometheus (Metriken), Grafana (Dashboards), Promtail (Log-Collection)
- Promtail sammelt Container-Logs automatisch, Label ist `service_name` = Container-Name
- Error-Code-System: ESP32 1000-4999, Server 5000-5999
- Referenzdokumente: `ERROR_CODES.md`, `LOG_LOCATIONS.md`, `COMMUNICATION_FLOWS.md`
- 26-Panel Grafana Dashboard mit Service-Filter und Interval-Dropdown

**Architektur-Kontext:**
- Server-zentrisch: ESP32 = dumme Agenten, ALLE Logik auf Server
- 4 Schichten: ESP32 Firmware → MQTT Broker → FastAPI Backend → Vue 3 Frontend
- Docker Stack: 11 Services (4 Core + 6 Monitoring + 1 DevTools)
  - [verify-plan Korrektur] 6 Monitoring: Loki, Promtail, Prometheus, Grafana, postgres-exporter, mosquitto-exporter
- Geplanter Datenfluss KI: Loki/Prometheus → Jetson ML-Container → MQTT `ao/ml/{method}/results` [**geplant, existiert noch NICHT**] → El Servador → Grafana ML-Dashboard

## Aufgabe

**Vollständige Erstanalyse aller Datenquellen, Strukturen und Patterns im System, die für die KI-Integration relevant sind.** Der Fokus liegt auf: Was haben wir, wie ist es strukturiert, was fehlt, und wie muss es aufgebaut werden damit 8 ML-Methoden damit arbeiten können.

### Teil 1: Bestandsaufnahme – Was produziert das System an Daten?

**Logs (für Log-Klassifikation, Anomalie-Erkennung, Log-Clustering):**
- Welche Log-Formate nutzt jeder Layer? (JSON-structured, Freitext, gemischt?)
- Welche Log-Levels existieren? (DEBUG, INFO, WARNING, ERROR, CRITICAL – konsistent über alle Layer?)
- Welche Felder sind in strukturierten Logs vorhanden? (Timestamp, Level, Message, Module, Error-Code, Device-ID, Correlation-ID?)
- Wie sieht der Output von El Servador aus? (god_kaiser.log Format, Felder, Rotation)
- Wie sieht der ESP32 Serial-Output aus? (Format, Struktur, Muster)
  - **[verify-plan Ergänzung: Wokwi vs. Echte ESP — UNBEDINGT AUSEINANDERHALTEN]**
    - **Wokwi-Simulation** (`WOKWI_SIMULATION=1`): ESP ID ist deterministisch `ESP_00000001` (Build-Flag), NVS ist RAM-only (nicht persistent), Watchdog deaktiviert, WiFi über `Wokwi-GUEST`/`host.wokwi.internal`, Logs unter `logs/wokwi/`. Serial-Output enthält `[WOKWI]`-Prefix-Zeilen.
    - **Echte Hardware** (`seeed_xiao_esp32c3` / `esp32_dev`): ESP ID aus MAC-Adresse (`ESP_{3 letzte MAC-Bytes}`), NVS persistent in Flash, Watchdog aktiv (30s), WiFi aus NVS-Config, Logs unter `logs/current/esp32_serial.log`.
    - **Server-seitig existiert `DataSource` Enum** (`enums.py:10-26`): `PRODUCTION`, `MOCK`, `TEST`, `SIMULATION`. Jeder SensorData/ActuatorState-Eintrag hat ein `data_source`-Feld. ML muss nach `data_source` filtern — Wokwi-Daten (`SIMULATION`) dürfen NICHT mit echten Produktionsdaten (`PRODUCTION`) für Training gemischt werden!
    - **Seed-Script** (`scripts/seed_wokwi_esp.py`): Pre-registriert Wokwi-ESP mit `capabilities.wokwi: true` und `device_metadata.source: "wokwi_simulation"` → überspringt Approval-Flow!
    - **Build-Environments** (`platformio.ini`): 3 Envs — `seeed_xiao_esp32c3` (Produktion), `esp32_dev` (Entwicklung), `wokwi_simulation` (Simulation). Conditional Compilation via `#ifdef WOKWI_SIMULATION` an ~10 Stellen (config_manager.cpp, main.cpp, onewire_bus.cpp, time_manager.cpp)
- Wie loggt der MQTT-Broker? (Mosquitto Log-Format, was wird erfasst)
- Frontend-Logs? (Console, Error-Boundary, strukturiert?)
- Gibt es bereits Correlation-IDs oder Request-IDs die Events über Layer hinweg verknüpfen?

**Metriken (für Predictive Failure, Metrik-Korrelation, Drift Detection):**
- Welche Prometheus-Metriken existieren bereits? (Vollständige Liste mit Labels)
- Welche Metriken exposed El Servador? (`/metrics` Endpoint – was genau?)
- Mosquitto-Exporter: welche Broker-Metriken? [verify-plan: existiert als `mosquitto-exporter` Service, Image `sapcc/mosquitto-exporter:0.8.0`, Container `automationone-mosquitto-exporter`, Profile: monitoring]
- PostgreSQL-Exporter: welche DB-Metriken? [verify-plan: existiert als `postgres-exporter` Service, Image `prometheuscommunity/postgres-exporter:v0.16.0`, Container `automationone-postgres-exporter`, Profile: monitoring]
- cAdvisor oder Container-Metriken: vorhanden? [verify-plan: cAdvisor ist NICHT im Docker-Stack konfiguriert]
- Scrape-Intervalle? Retention-Policy?
- Welche Metriken FEHLEN die für ML wichtig wären? (ESP32 RSSI, Heap, Uptime, Message-Rates, Queue-Depths)

**Events & Flows (für Cross-Layer-Korrelation, Sequenz-Pattern-Mining):**
- Welche definierten Kommunikationsflüsse gibt es? (Device Registration, Sensor Data, Commands, Heartbeats)
  - **[verify-plan Ergänzung: Device Pending/Approval Flow — EXISTIERT und ist ML-RELEVANT]**
    - **Vollständiger Device-Lifecycle (State Machine):**
      ```
      Unbekannter ESP sendet Heartbeat
              ↓
        pending_approval  ←── (Rediscovery nach 5min Cooldown)
              ↓                         ↑
        [Admin approved]          [Cooldown abgelaufen]
              ↓                         ↑
          approved                  rejected
              ↓                    ↑
        [Nächster Heartbeat]  [Admin rejected]
              ↓                    ↑
           online ←──→ offline ────┘
      ```
    - **Discovery-Flow (heartbeat_handler.py:119-141):**
      1. ESP sendet Heartbeat → Server findet ESP NICHT in DB
      2. Rate-Limiting Check: max 1 Discovery/5min pro Device, max 10/min global
      3. Neuer `ESPDevice` mit `status="pending_approval"` in DB erstellt
      4. Audit-Log: `DEVICE_DISCOVERED`
      5. WebSocket-Event: `device_discovered` → Frontend zeigt Pending-Device
      6. Heartbeat-ACK an ESP: `{status: "pending_approval", config_available: false}`
    - **Approval-Flow (esp.py:1089-1198):**
      1. Admin ruft `POST /v1/esp/devices/{esp_id}/approve` auf (Operator-Rolle nötig)
      2. Device-Status: `pending_approval` → `approved` (NICHT direkt `online`!)
      3. Audit-Log: `DEVICE_APPROVED`, WebSocket: `device_approved`
      4. Beim NÄCHSTEN Heartbeat: `approved` → `online` (2-Stufen-Transition)
      5. Heartbeat-ACK: `{status: "online", config_available: <bool>}`
    - **Rejection-Flow (esp.py:1201-1300):**
      1. Admin ruft `POST /v1/esp/devices/{esp_id}/reject` auf
      2. Device-Status → `rejected`, `rejection_reason` gesetzt
      3. 5-Minuten Cooldown (`last_rejection_at`), danach automatische Rediscovery
      4. Heartbeat-ACK: `{status: "rejected"}` während Cooldown
    - **REST-Endpoints (esp.py):**
      - `GET /v1/esp/devices/pending` — Liste aller Pending-Devices
      - `POST /v1/esp/devices/{esp_id}/approve` — Genehmigung
      - `POST /v1/esp/devices/{esp_id}/reject` — Ablehnung
    - **WebSocket-Events:** `device_discovered`, `device_approved`, `device_rejected`, `device_rediscovered`
    - **ML-Relevanz:** Jeder State-Übergang wird audit-geloggt → Trainings-Daten für Anomalie-Erkennung (z.B. unerwartete Discovery-Bursts, Rejection-Loops). Heartbeat-ACK-Status ist ein Signal das ESP-Verhalten beeinflusst.
    - **WICHTIG Wokwi vs. Echte ESP:** Wokwi-ESP wird per Seed-Script (`seed_wokwi_esp.py`) PRE-REGISTRIERT mit `status="offline"` → überspringt `pending_approval` komplett! Echte ESPs durchlaufen IMMER den vollen Discovery→Approval-Flow. Für ML-Training: Wokwi-ESPs generieren KEINE Approval-Events.
- Gibt es Timestamps an allen kritischen Punkten eines Flows? (ESP32 sendet → Broker empfängt → Server verarbeitet → DB schreibt → Frontend updated)
- Wie sind Timeouts definiert? (MQTT keepalive, HTTP timeouts, Watchdog-Timer)
- Welche bekannten Fehler-Kaskaden existieren bereits? (z.B. WiFi-Verlust → MQTT-Disconnect → Server-Timeout → Frontend-Stale)

### Teil 2: Analyse – Wie gut sind die Daten für ML vorbereitet?

**[verify-plan Ergänzung: Datenquellen-Trennung Wokwi vs. Echte Hardware]**
- Das `DataSource` Enum (`enums.py`) unterscheidet: `PRODUCTION` (echte ESPs), `SIMULATION` (Wokwi), `MOCK` (Python-Tests), `TEST` (temporär)
- `SensorData.data_source`, `ActuatorState.data_source`, `ESPHeartbeat.data_source` — jeder DB-Eintrag ist getaggt
- `DataSource.is_test_data()` liefert `True` für MOCK/TEST/SIMULATION
- **ML-Implikation:** Training MUSS nach `data_source == PRODUCTION` filtern. Wokwi-Daten haben andere Timing-Charakteristiken (kein echter WiFi-Jitter, deterministisches Verhalten, kein NVS-Persist)
- **Wokwi-ESPs erzeugen KEINE echten Approval-Events** (pre-seeded), KEINE echten Discovery-Bursts, KEINE WiFi-Reconnects

**Strukturqualität:**
- Sind Logs maschinenlesbar? (Parsing-Aufwand für ML-Pipeline)
- Sind Timestamps konsistent über alle Layer? (Format, Timezone, Präzision)
  - [verify-plan: ESP32-Firmware hat expliziten UTC-Fix in time_manager.cpp:72-77: `setenv("TZ", "UTC0", 1)` — Wokwi BRAUCHT diesen Fix weil es sonst Host-Timezone nutzt (z.B. CET → 1h Offset)]
- Gibt es eindeutige Identifier die Events verknüpfen? (Device-ID, Session-ID, Request-ID)
- Wie viel Rauschen ist in den Logs? (Debug-Spam, repetitive Health-Checks, etc.)

**Label-Readiness:**
- Welche impliziten Kategorien existieren bereits in den Logs? (Error-Codes, Log-Levels, Module-Namen)
- Wie gut decken die Error-Codes das tatsächliche Fehlerspektrum ab?
- Gibt es Log-Patterns die KEINEN Error-Code haben aber trotzdem Probleme anzeigen?
- Welche natürlichen Cluster würde ein ML-Modell vermutlich finden?

**Baseline-Fähigkeit:**
- Gibt es genug "normales" Verhalten dokumentiert für Anomalie-Erkennung? (Wie sieht ein gesunder Systemzustand aus?)
- Sind Metriken stabil genug für Drift Detection? (Oder schwanken sie zu stark im Normalbetrieb?)
- Gibt es saisonale oder zyklische Muster? (Tag/Nacht, Bewässerungszyklen, etc.)

### Teil 3: Gap-Analyse – Was muss aufgebaut werden?

**PATTERNS.yaml (Fehlermuster-Katalog):**
- Welche Fehlertypen treten im System auf? (Aus Logs, Error-Codes, bekannten Bugs ableiten)
- Vorschlag für die PATTERNS.yaml Struktur: Welche Felder braucht jeder Eintrag damit ALLE 8 ML-Methoden damit arbeiten können? Minimum:
  - Pattern-ID, Symptome (mit Container + Log-Pattern + Frequenz), Ursache, Lösung, beteiligte Layer, Korrelationsfenster, Schweregrad
  - PLUS: Beispiel-Logzeilen (für Klassifikator-Training), zugehörige Metriken-Anomalien (für Korrelation), erwartete Folge-Events (für Sequenz-Mining)
- Wie viele Patterns lassen sich JETZT SCHON aus dem bestehenden Code und den Error-Codes ableiten?
- Wo sollte PATTERNS.yaml leben? (`.claude/reference/errors/` oder eigener ML-Bereich?)

**Label-Taxonomie:**
- Vorschlag für eine hierarchische Label-Struktur die sowohl menschlich lesbar als auch ML-tauglich ist
- Dimensionen: Layer (firmware/broker/backend/frontend/database), Severity (critical/warning/info), Kategorie (network/hardware/software/config/resource), Auswirkung (service-down/degraded/cosmetic)
- Wie werden Labels an Logs angehängt? (Promtail-Pipeline? Server-seitiges Tagging? Nachträgliche Annotation?)

**LogQL Recording Rules:**
- Welche Log-basierten Metriken sollten als Recording Rules definiert werden?
- Mindestens: Error-Rate pro Service, Timeout-Häufigkeit, Reconnect-Frequenz, spezifische Pattern-Matches
- Format und Speicherort der Rules (Loki-Config vs. Grafana)

**Fehlende Daten-Pipelines:**
- Brauchen wir einen zentralen "Event-Bus" oder reicht Loki + Prometheus?
- Wie kommen ESP32-spezifische Metriken (RSSI, Heap, Boot-Reason) in Prometheus? (Über MQTT → Server → Prometheus-Export?)
  - [verify-plan: Heartbeat-Payload enthält `heap_free`, `wifi_rssi`, `uptime`, `sensor_count`, `actuator_count`, `gpio_status`. Diese landen via heartbeat_handler.py in der DB (ESPHeartbeat Model). `prometheus-fastapi-instrumentator` (commit 9f22ac5) instrumentiert HTTP-Endpoints, aber MQTT-basierte ESP-Metriken sind vermutlich NICHT als Prometheus-Gauges exportiert. Das wäre eine Gap.]
- Brauchen wir eine Zwischenschicht die Logs anreichert bevor sie in Loki landen? (z.B. Promtail-Pipeline-Stages für Label-Extraction)

### Teil 4: Empfehlung – Architektur der Debug-Wissensbasis

Basierend auf der Analyse, einen konkreten Vorschlag für:

1. **Dateistruktur:** Wo leben PATTERNS.yaml, Label-Taxonomie, Recording Rules, ML-Konfigurationen? Vorschlag für eine Verzeichnisstruktur die zukunftsfähig und wartbar ist.

2. **PATTERNS.yaml Schema:** Vollständiger Schema-Entwurf mit allen Feldern, Typen und Validierungsregeln. Muss für Menschen UND Maschinen gleichermaßen nutzbar sein.

3. **Label-Taxonomie Dokument:** Entwurf der Taxonomie mit allen Dimensionen, Werten und Beispielen.

4. **Recording Rules:** Liste der empfohlenen LogQL Recording Rules mit Query und Zweck.

5. **Datenfluss-Diagramm:** Wie fließen Daten vom Ursprung (ESP32/Server/Frontend) durch die Pipeline (Promtail/Loki/Prometheus) zur ML-Box (Jetson) und zurück (Ergebnisse → Grafana). Jeder Schritt mit Format-Transformation und Label-Anreicherung.

6. **Prioritäten:** Was muss ZUERST gebaut werden? Was kann parallel? Was braucht erst mehr Daten?

## Erfolgskriterium

- Vollständige Bestandsaufnahme aller Datenquellen mit Formatbeschreibung und Code-Referenzen
- Jede der 8 ML-Methoden ist explizit adressiert: welche Daten braucht sie, welche existieren schon, welche fehlen
- PATTERNS.yaml Schema-Entwurf der für alle 8 Methoden funktioniert
- Label-Taxonomie-Entwurf mit konkreten Werten und Beispielen
- Liste empfohlener LogQL Recording Rules
- Gap-Liste: was fehlt, priorisiert nach Wichtigkeit und Aufwand
- Datenfluss von Quelle bis ML-Modell dokumentiert
- Alle Findings mit Code-Referenzen belegt (Datei + Funktion/Klasse/Config-Abschnitt)
- Bewertung: Wie ML-ready ist das System aktuell auf einer Skala von 1-10, mit Begründung
- **[verify-plan Ergänzung]** Explizite Trennung: Welche Findings gelten für echte Hardware (PRODUCTION) und welche für Wokwi (SIMULATION)? Device-Lifecycle-Events (Discovery, Approval, Rejection) existieren NUR bei echten ESPs. Wokwi-Daten sind für Timing/Pattern-Training ungeeignet (deterministisches Verhalten, kein WiFi-Jitter, keine echte NVS-Persistenz)

## Report zurück an
.technical-manager/inbox/agent-reports/ki-debug-preparation-analysis-2026-02-10.md
