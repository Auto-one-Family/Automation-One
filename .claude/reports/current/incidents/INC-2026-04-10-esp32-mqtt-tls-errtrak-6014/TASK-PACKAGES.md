# TASK-PACKAGES — INC-2026-04-10-esp32-mqtt-tls-errtrak-6014

**Stand:** nach `verify-plan`-Gate (2026-04-11), eingearbeitet in diese Datei.  
**Git:** Umsetzung ausschließlich auf Branch `auto-debugger/work` (von `master`); keine Commits auf `master`.

---

## PKG-01 — ErrorTracker: Baseline bei Convenience-Loggern (6014 / UNKNOWN)

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` |
| **Risiko** | Niedrig (Observability/Kategorisierung); keine Safety-Aktor-Logik. |
| **Scope** | `El Trabajante/src/error_handling/error_tracker.cpp` (Methoden `logCommunicationError`, mindestens; **Audit** analog `logApplicationError` / `logServiceError` — gleiches Muster: volle Codes aus `error_codes.h` + erneute Addition der Range-Baseline führt zu Codes außerhalb der `getCategoryString`-Fenster und damit `UNKNOWN`). |
| **Kontext** | `logCommunicationError(ERROR_MQTT_DISCONNECT, …)` → `3000+3014=6014`; `getCategoryString` erwartet COMMUNICATION nur für `<4000` → `UNKNOWN`. |
| **Implementierungsrichtung** | Wenn `code` bereits in der Zielspanne liegt (z. B. Kommunikation `3000–3999`), `trackError(code, …)` ohne erneute Addition; sonst `ERROR_COMMUNICATION + code` beibehalten **nur** für echte Offsets (falls noch Call-Sites mit Offset existieren — aktuelle Produktions-Call-Sites nutzen durchgängig absolute Defines). |
| **Tests / Verifikation** | `cd "El Trabajante" && pio run -e seeed_xiao_esp32c3` (Exit 0). Optional: `pio run -e native` falls native Tests den ErrorTracker abdecken. |
| **Akzeptanz** | Nach Fix: bei simuliertem `MQTT_EVENT_DISCONNECTED` muss ERRTRAK **3014** und Kategorie **COMMUNICATION** zeigen (nicht 6014/UNKNOWN). Keine Regression bei Throttle-Slot (`error_code % 32`). |
| **Abhängigkeiten** | Keine — zuerst ausführen. |

---

## PKG-02 — TLS-Timeout / Broker-Pfad (Infrastruktur + Beobachtung)

| Feld | Inhalt |
|------|--------|
| **Owner** | `mqtt-debug` (Checkliste, Logs) + Robin (Netz/Broker-Zugang) |
| **Risiko** | — (kein Code im Repo zwingend) |
| **Scope** | Gegenprobe: Broker erreichbar (Port, TLS, Zertifikat), DNS, Firewall; Mosquitto-Log im **UTC**-Fenster parallel zu Serial; MQTT-URI-Schema nur ohne Credentials dokumentieren. |
| **Tests / Verifikation** | Manuell: `openssl s_client` / `mosquitto_sub` vom gleichen Netzsegment (keine Secrets in Artefakten). |
| **Akzeptanz** | Entweder infra-seitige Ursache belegt **oder** als BLOCKER `B-NET-01` geschlossen mit „kein Broker-Log verfügbar“. |
| **Abhängigkeiten** | Unabhängig von PKG-01; parallel möglich. |

---

## PKG-03 — Heap / max_alloc vs. MQTT (optional)

| Feld | Inhalt |
|------|--------|
| **Owner** | `esp32-dev` / `esp32-debug` |
| **Risiko** | Niedrig (Analyse); Änderungen nur nach Messdaten. |
| **Scope** | Wenn Robin `max_alloc`/Heap zum Disconnect-Zeitpunkt nachreicht: Abgleich mit Publish-Pfad, Outbox, PSRAM-Konfiguration — **Hypothese H3**, kein Fix ohne Messung. |
| **Tests / Verifikation** | Hardware-Serial + ggf. Wokwi-Vergleich. |
| **Akzeptanz** | Messwerte dokumentiert; entweder verworfen oder follow-up-Paket definiert. |
| **Abhängigkeiten** | **BLOCKER** `B-HEAP-01` bis Messdaten vorliegen. |

---

## Verify-Einarbeitung (Delta-Log)

| Quelle | Änderung am Paketplan |
|--------|------------------------|
| `verify-plan` | Build-Befehl korrigiert: **`pio run -e seeed`** existiert in `platformio.ini` nicht; gültig: **`seeed_xiao_esp32c3`**. |
| `verify-plan` | Agent-Pfade: `esp32-dev` → `.claude/agents/esp32-dev.md`; `mqtt-debug` → `.claude/agents/mqtt-debug.md` (nicht die älteren Unterordner-Pfade aus Verify-Anhang). |
| Code-Audit | PKG-01 um **logApplicationError**-Audit erweitert (gleiches Baseline-Muster möglich). |
