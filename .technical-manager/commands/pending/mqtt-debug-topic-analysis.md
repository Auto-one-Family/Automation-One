# Auftrag an @esp32-dev / @mqtt-dev
Datum: 2026-02-10 04:30

## Context

Phase 2A: ESP32 Debug-Infrastruktur. Dies ist der zweite von drei Debug-Kanälen: ein MQTT-basierter Debug-Topic, über den ESP32-Devices Debug-Daten direkt in den Monitoring-Stack (Loki/Grafana) liefern können – statt nur über Serial.

**Ziel:** ESP32-Geräte sollen Debug-Informationen (Logs, Fehlerzustände, Diagnose-Daten) über MQTT publishen. Diese Daten fließen über den Server in Loki und sind in Grafana sichtbar. Das ergänzt den Serial-Output um einen produktionstauglichen Debug-Kanal.

**Architektur-Kontext:**
- MQTT Topics folgen dem Schema: `ao/{esp_id}/{resource}/{action}`
- Error Codes: ESP32 1000-4999, Server 5000-5999
- Monitoring: Loki (Logs), Prometheus (Metriken), Grafana (Dashboards)
- Promtail sammelt Container-Logs, Label ist `service_name`
- Server verarbeitet MQTT-Messages über Handler

## Aufgabe

**Vollständige Codebase-Analyse für MQTT Debug-Topic Implementation:**

### Teil 1: IST-Zustand MQTT-Kommunikation
- Welche MQTT-Topics existieren aktuell? (ESP32-seitig publiziert, Server-seitig subscribed)
- Wie ist das Topic-Schema strukturiert? Gibt es bereits System- oder Debug-Topics?
- Wie verarbeitet der Server eingehende MQTT-Messages? (Handler-Architektur, Routing, Parsing)
- Gibt es bereits Logging-Mechanismen für MQTT-Traffic auf Server-Seite?
- Wie published der ESP32 aktuell? (QoS, Retain, Payload-Format, Frequenz)

### Teil 2: IST-Zustand ESP32-seitiges Debugging
- Welche Debug-/Log-Ausgaben macht der ESP32 aktuell? (Serial.print, eigene Log-Macros, Error-Reporting)
- Gibt es bereits eine Abstraktion für Log-Levels auf dem ESP32?
- Welche Diagnose-Daten wären wertvoll über MQTT zu senden? (Heap, Uptime, WiFi-RSSI, Error-Counts, Watchdog-Events, Boot-Reason)
- Wie viel RAM/Flash-Budget ist verfügbar für zusätzliche MQTT-Publishes?

### Teil 3: Design-Analyse für Debug-Topic
- Vorschlag für Topic-Struktur: `ao/{esp_id}/system/debug` oder anders? Begründung.
- Payload-Format bewerten: JSON vs. kompakt? Was passt zum bestehenden Pattern?
- Frequenz und Trigger: Periodisch (alle X Sekunden) vs. Event-basiert (nur bei Fehlern/Zustandsänderungen)?
- Server-seitige Verarbeitung: Neuer Handler oder Extension eines bestehenden?
- Wie kommen die Debug-Daten von Server → Loki? (Structured Logging, dedizierter Log-Stream)
- Grafana-Integration: Neues Panel oder Integration in bestehendes Debug-Dashboard?
- Auswirkung auf MQTT-Broker-Last und ESP32-Performance bewerten

## Erfolgskriterium
- Komplette Bestandsaufnahme aller existierenden MQTT-Topics (beide Seiten)
- ESP32 Debug-Output ist katalogisiert (was wird aktuell wohin geloggt)
- Konkreter Design-Vorschlag für Debug-Topic mit Begründung
- Payload-Schema-Entwurf
- Server-Handler-Architektur-Vorschlag (passend zum bestehenden Pattern)
- Einschätzung der Auswirkung auf ESP32-Ressourcen (RAM, MQTT-Bandwidth)
- Alle Findings mit Code-Referenzen belegt

## Report zurück an
.technical-manager/inbox/agent-reports/mqtt-debug-topic-analysis-2026-02-10.md
