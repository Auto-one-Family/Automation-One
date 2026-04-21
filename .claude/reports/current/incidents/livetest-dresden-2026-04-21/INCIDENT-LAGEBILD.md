# INCIDENT-LAGEBILD — Live-Hartetest Dresden 2026-04-21

> **Incident-ID:** livetest-dresden-2026-04-21  
> **Branch:** auto-debugger/work  
> **Linear:** AUT-108  
> **Stand:** Lauf-2 (nach Lauf-0 + Lauf-1)

---

## Gesamtstatus

| Schicht | Ampel | Kernbefund |
|---------|-------|------------|
| Docker/Infra | GRUEN | 13/13 Services healthy/running |
| ESP32 (EA5484) | GRUEN | Stabil, kein einziger ERROR, kein Disconnect |
| Server (god_kaiser) | GELB | 1x ERROR (intent_outcome), 1x 401, LWT-Handler passiv |
| MQTT (Broker) | GELB | QoS-Mismatch Safety-Topics, 4 Retained-Anomalien |
| Frontend | GELB | WS-Gap beim Actuator-Timeout, kein Auto-Reload nach Max-Reconnects |
| **Gesamt** | **GELB** | **Keine kritischen Failures — 3 sicherheitsrelevante GELB-Items** |

---

## Lauf-0 — State Snapshot

- **Docker:** 13 Services (Issue nennt 14 — compose.yml definiert 13, kein Defekt)
- **Git:** 2 unstaged Änderungen (`logic.py`, `sensor_diff_evaluator.py`) — reine Lint-Fixes, kein funktionaler Einfluss
- **ESP_EA5484:** Live aktiv, DS18B20/SHT31/Moisture alle 30s publizierend
- **Commit:** d3bf3e50 (docs)

---

## Lauf-1 — Befunde pro Fokusbereich

### Fokusbereich A — Sensor-Latenz

**Bewertung: GRUEN**

| Messwert | IST | SOLL |
|----------|-----|------|
| Sensor-Publish-Intervall | 30s (30000ms Firmware-Konstante) | 30s |
| MQTT-Receive bis DB-Persist | <1s (gleicher Log-Sekunden-Timestamp) | <2s E2E |
| Frontend-WS-Processing | synchron, kein Batching/Debouncing | <2s E2E |
| Heartbeat-Intervall | **60s** (HEARTBEAT_INTERVAL_MS=60000) | **SOLL laut Issue: 30s** — DISKREPANZ |

**Offener Punkt A1:** Heartbeat-Intervall ist 60s Firmware-Konstante, Issue-SOLL nennt 30s. Klärbedarf: Ist das SOLL veraltet oder muss Firmware angepasst werden?

---

### Fokusbereich B — Aktor-Antwortzeit

**Bewertung: NICHT MESSBAR (keine echten Commands im Lauf-1-Fenster)**

- Logic-Engine `TestTimmsRegen` feuert alle 60s → `persist_noop_skip` (GPIO14 bereits ON)
- Kein Command-Toggle ausgelöst, daher E2E-Latenz nicht gemessen
- Code-Analyse: Command-to-GPIO-to-ACK < 500ms erwartet (synchroner Firmware-Flow)
- **KRITISCHES GAP:** Falls WS während Actuator-Bestätigung trennt → Frontend zeigt false Timeout-Toast (30s)

---

### Fokusbereich C — LWT & Reconnect

**Bewertung: GELB — Sicherheitsrelevant**

- **C1 — Server-LWT-Handler passiv:** Offline-Erkennung NUR über 60s-Poller. LWT-Topic `system/will` wird vom Broker sofort published, aber kein `lwt_handler`-Log sichtbar. Bei echtem ESP-Ausfall: bis zu 60s Blind-Zeit für den Server.
- **C2 — False-Positive Poller:** Bei 07:30:37-07:31:38Z erkannte Server ESP als offline (offline_seconds=60.9) obwohl Broker keinen Disconnect sah. Ursache: Poller traf ~1s vor Heartbeat-Eingang.
- **C3 — Disconnect-Simulation (Fokusbereich C Hartetest):** Noch nicht durchgeführt — SOLL laut Issue: mosquitto 30s trennen, dann Reaktion beobachten.
- **Frontend:** LWT-Verarbeitung korrekt implementiert (`source='lwt'` → Device offline → Actuator-Reset → Toast).

---

### Fokusbereich D — Logic-Engine Cross-ESP

**Bewertung: GRUEN (im Rahmen des Beobachtbaren)**

- `TestTimmsRegen`: 29x gefeuert, immer `persist_noop_skip` — korrekt (Regel-Auslöser vorhanden, Zustand bereits SOLL)
- Intervall: ~60s (2x leicht verlängert bei Disconnect-Event: 86s, 90s — normal)
- Dry-Run Bodenfeuchte < 20% → Pumpe: NOCH NICHT getestet (erfordert manuelle Konfiguration)

---

## Sicherheitsrelevante Befunde (Priorität)

### SICHER-1: QoS-Mismatch Actuator-Commands (MITTEL)
**Schicht:** MQTT/ESP32-Firmware  
**Evidenz:** Broker-Log 18:05:55Z — ESP subscribed `actuator/+/command` mit QoS 1, SOLL laut MQTT_TOPICS.md: QoS 2 (Exactly-Once)  
**Risiko:** Actuator-Commands könnten doppelt geliefert werden bei Verbindungsproblemen. Bei Pumpen-/Heizungssteuerung sicherheitsrelevant.

### SICHER-2: Server-LWT-Latenz 60s (MITTEL/HOCH)
**Schicht:** Server  
**Evidenz:** SERVER-LOG state_adoption bei offline_seconds=60.9  
**Risiko:** 60s Blind-Zeit bei ESP-Ausfall. Server-seitige Failsafe-Aktion (z.B. Heizung OFF) verzögert sich.

### SICHER-3: Frontend WS-Gap Actuator-Timeout (NIEDRIG)
**Schicht:** Frontend  
**Evidenz:** Code-Analyse `useActuatorCommand.ts` — ACTUATOR_RESPONSE_TIMEOUT_MS=30s  
**Risiko:** Bei WS-Trennung während ESP-Bestätigung: false Timeout-Toast, User-Verwirrung.

---

## Noch ausstehende Tests (aus AUT-108)

- [ ] Actuator-Command-Toggle manuell auslösen → E2E-Latenz messen (Fokus B)
- [ ] mosquitto 30s trennen → LWT-Reaktion beobachten (Fokus C)
- [ ] Logic-Engine Dry-Run: Bodenfeuchte-Schwellwert auslösen (Fokus D)
- [ ] Frontend HAR-Aufnahme (10min L2 OrbitalView) — manuell durch User
- [ ] db-inspector on demand (falls sensor_data Lücken festgestellt)

---

## Eingebrachte Erkenntnisse (Lauf-2, 2026-04-21)

Alle 4 Debug-Agents abgeschlossen. 3 sicherheitsrelevante GELB-Befunde identifiziert.
Kein CRITICAL/ROT-Befund — System stabil und produktionsfähig mit bekannten Einschränkungen.
TASK-PACKAGES erstellt. verify-plan-Gate ausstehend.

- **Update (Lauf-3/Lauf-4 Follow-up, 2026-04-21):** Der EA-Hardening-Cluster aus Linear wurde nach finalem Live-Gate formal abgeschlossen (`AUT-54`, `AUT-55`, `AUT-57`, `AUT-58`, `AUT-59`, `AUT-60`, `AUT-61`, `AUT-63`, `AUT-65` auf `Done`). Finales UTC-Verify-Fenster: `07:45:33Z` bis `08:20:18Z` mit korrelierter Broker/Server/Serial-Evidence.
