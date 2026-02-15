# Auftrag an @system-control / @esp32-dev
Datum: 2026-02-10 04:30

## Context

Phase 2A: ESP32 Debug-Infrastruktur. Dies ist der dritte Debug-Kanal: ein ser2net-Container der echte ESP32-Hardware-Serial-Logs in den Docker-Stack bringt. Damit landen Serial-Logs von physischen Devices in Loki/Grafana – gleichwertig mit Container-Logs.

**Ziel:** Ein Docker-Container der über ser2net (oder Alternative) den Serial-Port eines physisch angeschlossenen ESP32 exposed, sodass die Serial-Ausgabe über Promtail in Loki landet und in Grafana sichtbar ist. Das schließt die Lücke zwischen Hardware-Debugging (Serial Monitor) und dem Monitoring-Stack.

**Architektur-Kontext:**
- Docker Desktop auf Windows mit WSL2 (mirrored networking mode)
- Bestehender Stack: 9 Services (4 Core + 4 Monitoring + 1 DevTools)
- Promtail sammelt Container-Logs automatisch über Docker-Socket
- Loki Label: `service_name` = Container-Name
- ESP32 Serial-Output: 115200 Baud, Mix aus Debug-Logs und strukturierten Daten
- USB-Serial: ESP32 über USB an Windows-Host → COM-Port → WSL2 Zugriff nötig

## Aufgabe

**Vollständige Analyse für ser2net-Container Integration:**

### Teil 1: IST-Zustand Serial-Debugging
- Wie wird Serial-Debugging aktuell gemacht? (PlatformIO Serial Monitor, Arduino Serial Monitor, andere Tools)
- Welches Format hat der ESP32 Serial-Output? (Freitext, strukturiert, JSON, gemischt?)
- Welche USB-Serial-Chips werden verwendet? (CP2102, CH340, etc.)
- Wie funktioniert USB-Passthrough von Windows Host → WSL2 → Docker Container? (usbipd-win?)

### Teil 2: ser2net Technologie-Analyse
- Was ist ser2net, wie funktioniert es? (Serial-to-Network Bridge)
- Welche Alternativen gibt es? (socat, remserial, eigener Python-Service mit pyserial)
- Docker-Images verfügbar? (offizielle, community, self-build nötig?)
- Konfiguration: Wie mapped man einen Serial-Port in einen Docker-Container unter Windows/WSL2?
- Netzwerk-Exposition: TCP-Port, WebSocket, oder anderer Mechanismus?

### Teil 3: Integration in den Docker-Stack
- Wie würde der Container in `docker-compose.yml` aussehen? (Service-Definition, Volumes, Devices, Profiles)
- Welches Docker Compose Profile? (`devtools` oder eigenes `hardware` Profile?)
- Wie kommt der Serial-Output in Promtail/Loki?
  - Option A: ser2net Container loggt nach stdout → Promtail sammelt wie jeden anderen Container
  - Option B: Eigener Log-File-Mount den Promtail scraped
  - Option C: Direkter Loki-Push über einen Adapter
- Parsing: Serial-Output ist unstrukturiert – braucht es eine Pipeline-Stage in Promtail? (Regex, JSON-Extraktion, Timestamp-Parsing)
- Label-Strategie: Welcher `service_name`? Wie unterscheidet man mehrere ESP32-Devices?

### Teil 4: Machbarkeit & Risiken
- Windows/WSL2/Docker Device-Passthrough: Funktioniert das zuverlässig? Bekannte Probleme?
- Hot-Plug: Was passiert wenn ESP32 abgesteckt/angesteckt wird? (Container-Restart, Auto-Reconnect?)
- Performance: Latenz Serial → Loki? Akzeptabel für Debugging?
- Mehrere Devices gleichzeitig: Skaliert der Ansatz?
- Alternative: Ist ein simpler Python-Container mit pyserial + Loki-Push vielleicht einfacher als ser2net?

## Erfolgskriterium
- Klare Aussage ob ser2net unter Windows/WSL2/Docker machbar ist (mit Begründung)
- Falls ja: Architektur-Skizze wie der Container in den Stack integriert wird
- Falls nein/schwierig: Alternative Lösung vorgeschlagen und bewertet
- USB-Passthrough-Pfad dokumentiert (Windows → WSL2 → Docker)
- Promtail/Loki Integration-Strategie definiert (welche Option, warum)
- Einschätzung Aufwand und Risiken
- Alle Findings mit Quellen belegt (Dokumentation, Docker-Docs, ser2net-Docs)

## Report zurück an
.technical-manager/inbox/agent-reports/ser2net-analysis-2026-02-10.md

---

## Execution Log (by VS Code Agent)

**Ausgefuehrt:** 2026-02-10
**Agents eingesetzt:** system-control, esp32-dev, general-purpose, test-log-analyst, esp32-development
**Status:** COMPLETE - Alle 4 Teile analysiert + 3 Firmware-Blocker identifiziert

### Ergebnis-Zusammenfassung

| Teil | Status | Kernergebnis |
|------|--------|-------------|
| Teil 1: IST-Zustand | DONE | 4 Serial-Formate, 115200 Baud, CP2102/CH340/CDC-ACM |
| Teil 2: ser2net Tech | DONE | ser2net machbar, Python pyserial empfohlen |
| Teil 3: Integration | DONE | Docker Compose + hardware Profile + Promtail Pipeline |
| Teil 4: Machbarkeit | DONE | Machbar mit TCP-Bridge Workaround (Option C) |
| **Bonus: Firmware** | **NEU** | **3 Blocker: Log-Volumen, JSON-Fragmentierung, kein Runtime-Toggle** |

### Kritische Zusatz-Findings (nicht im Original-Auftrag)

1. **BLOCKING:** ESP32 produziert ~214 Zeilen/s im Idle - uebersteigt 115200 Baud Limit
2. **HIGH:** 127 fragmentierte Serial.print() (0 println) in mqtt_client.cpp - halbe JSON-Zeilen bei ser2net
3. **MEDIUM:** Kein Runtime Log-Level Toggle - Firmware braucht ~55 min Preparation vor Integration

### Architektur-Korrektur

TM-Command sagte "9 Services (4 Core + 4 Monitoring + 1 DevTools)".
**Korrekt:** 11 Services (4 Core + 6 Monitoring + 1 DevTools). Die 6 Monitoring-Services sind: Loki, Promtail, Prometheus, Grafana, postgres-exporter, mosquitto-exporter.

### Reports generiert

| Report | Pfad |
|--------|------|
| Haupt-Analyse (TM) | `.technical-manager/inbox/agent-reports/ser2net-analysis-2026-02-10.md` |
| ser2net Tech-Research | `.claude/reports/current/ser2net-analysis.md` |
| ESP32 Serial Patterns | `.claude/reports/current/ESP32_DEV_REPORT.md` |
| Test Serial Output | `.claude/reports/current/TEST_SERIAL_OUTPUT_ANALYSIS.md` |
| Firmware Analyse | `.claude/reports/current/ESP32_SERIAL_FIRMWARE_ANALYSIS.md` |
