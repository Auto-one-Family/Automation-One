# STATE-LAUF0 — Live-Hartetest Dresden 2026-04-21

**Kontext:** AUT-108 Live-Hartetest Dresden, Lauf-0 (Stack-Briefing vor Lauf-1)
**Zeitpunkt Snapshot:** 2026-04-21, Server-Uhr zeigt ~07:48 UTC
**Arbeitsverzeichnis:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`

---

## Docker-Zustand

| # | Service | Container | Status | Uptime | Ports |
|---|---------|-----------|--------|--------|-------|
| 1 | alloy | automationone-alloy | Up (healthy) | 15h | 12345 |
| 2 | cadvisor | automationone-cadvisor | Up (healthy) | 15h | 8080 |
| 3 | el-frontend | automationone-frontend | Up (healthy) | 46min | 5173 |
| 4 | grafana | automationone-grafana | Up (healthy) | 15h | 3000 |
| 5 | loki | automationone-loki | Up (healthy) | 15h | 3100 |
| 6 | mosquitto-exporter | automationone-mosquitto-exporter | Up (running, kein healthcheck) | 15h | 9234 |
| 7 | mqtt-broker | automationone-mqtt | Up (healthy) | 15h | 1883, 9001 |
| 8 | mqtt-logger | automationone-mqtt-logger | Up (running, kein healthcheck) | 15h | - |
| 9 | postgres | automationone-postgres | Up (healthy) | 15h | 5432 |
| 10 | postgres-exporter | automationone-postgres-exporter | Up (healthy) | 15h | 9187 |
| 11 | prometheus | automationone-prometheus | Up (healthy) | 15h | 9090 |
| 12 | el-servador | automationone-server | Up (healthy) | 46min | 8000 |
| 13 | ntp | automationone_ntp | Up (healthy) | 15h | 123/udp |

**Gesamtzahl:** 13/13 laufende Services, davon 11 healthy + 2 ohne healthcheck (mosquitto-exporter, mqtt-logger — bauartbedingt, kein Defekt).

Hinweis: Die im Auftrag genannte Ziel-Zahl "14 Services" ist im aktuellen `docker compose` nicht vertreten — es laufen 13 definierte Services. Kein fehlender Service erkennbar, alle relevanten Rollen (Broker, Server, Frontend, DB, Observability, NTP) sind aktiv. **el-frontend** und **el-servador** wurden vor ~46min neu gestartet (neuer Build/Deploy vor Lauf-0 plausibel), der Rest läuft stabil seit 15h.

---

## Git-Zustand

- **Branch:** `auto-debugger/work`
- **Commit:** `d3bf3e50` — `docs(reports): add incident artifacts and refresh mqtt debug analysis` (2026-04-21)
- **Dirty Files:**
  - `M  El Servador/god_kaiser_server/src/api/v1/logic.py`
  - `M  El Servador/god_kaiser_server/src/services/logic/conditions/sensor_diff_evaluator.py`
  - `??  .claude/auftraege/auto-debugger/inbox/STEUER-livetest-dresden-2026-04-21.md`

**Bewertung Git:** GELB — zwei unversionierte Server-Edits (logic.py, sensor_diff_evaluator.py) im Logik-Engine-Pfad. Für den Live-Hartetest relevant, weil die Logic-Engine im Startup-Log bereits aktive Regeln feuert (`Rule TestTimmsRegen triggered`). Vor Lauf-1 klären: Sind die Edits für den Testlauf gewollt oder müssen sie gestasht werden?

---

## Server-Startup / Laufzeit-Snapshot (letzte 50 Zeilen `el-servador`)

Der Server ist seit 46min up und verarbeitet aktiv MQTT-Verkehr von einem realen ESP:

**Aktive ESP-Session:** `ESP_EA5484`
- Sensor-Pipeline funktioniert (Pi-Enhanced):
  - GPIO 4 `ds18b20` → 19.12 °C, quality=good
  - GPIO 0 `sht31_temp` → 19.1 °C, quality=good
  - GPIO 0 `sht31_humidity` → 54.5 %RH, quality=good
  - GPIO 32 `moisture` → 11.6 %, quality=fair
  - GPIO 33 `moisture` → 15.5 % / 16.7 %, quality=fair
- **VPD-Berechnung aktiv:** `vpd=1.0061 kPa (T=19.1°C, RH=54.5%)`
- **Actuator-Pipeline:** Command `ESP_EA5484 gpio=14 ON` ging durch safety_validate → load_context → persist_noop_skip (desired==current, no-op korrekt erkannt).
- **Actuator-Status-Updates** kommen zurück: GPIO 14 state=on value=255.0, GPIO 25 state=off value=0.0.
- **Heartbeat-ACK** (Early ACK + regulärer ACK) arbeitet: `heartbeat/ack (status=online)`.
- **Logic-Engine:** Regel `TestTimmsRegen` feuert alle ~30s.
- **Maintenance-Jobs:** `health_check_esps: 1/1 online`, `Sensor health: 6 healthy, 0 stale`.
- **Keine ERROR/WARN-Einträge** in den 50 Zeilen.

**Bewertung Server:** GRUEN — voll funktional, Daten fließen, Pipelines grün.

---

## MQTT-Broker (letzte 20 Zeilen `mqtt-broker`)

Die eingefangenen 20 Zeilen zeigen ausschliesslich periodische Health-Probes des Docker-Healthchecks (alle 30s: connect → subscribe `$SYS/#` → disconnect). Das ist **normal und gesund** — bedeutet aber, dass in diesem Log-Window keine Client-Connects/Disconnects von ESP oder el-servador zu sehen sind. Die Server-Seite belegt jedoch indirekt, dass MQTT-Traffic fließt (Sensor-Topics + Actuator-Commands kommen durch).

**Bewertung MQTT:** GRUEN — Broker healthy, Healthchecks laufen durch, Server-Seite bestätigt aktiven Traffic.

---

## Bewertung

| Dimension | Ampel | Begründung |
|-----------|-------|------------|
| Docker | GRUEN | 13/13 Services laufen, 11 healthy + 2 bauartbedingt ohne Check. Keine Crashes, keine Restart-Loops. |
| MQTT | GRUEN | Broker healthy, Server-Seite zeigt durchgehenden Sensor- und Actuator-Verkehr. |
| Server (el-servador) | GRUEN | Sensor-Pipeline, VPD, Actuator-Commands, Heartbeat-ACK, Logic-Engine, Maintenance-Jobs alle aktiv. Keine Errors. |
| Frontend (el-frontend) | GRUEN | healthy, 46min up (vor Lauf-0 neu deployed). |
| ESP-Konnektivität | GRUEN | `ESP_EA5484` sendet Heartbeats, Sensor-Daten (ds18b20, sht31, 2× moisture), Actuator-ACKs. |
| Git | GELB | Zwei ungespeicherte Server-Edits in der Logic-Engine (`logic.py`, `sensor_diff_evaluator.py`). Vor Lauf-1 Entscheidung nötig: commit, stash oder bewusst so testen. |
| **Gesamt für Lauf-1** | **GRUEN** (mit gelbem Git-Hinweis) | Stack ist betriebsbereit, reale ESP-Kommunikation bestätigt. Empfehlung: Git-Dirty-State vor Lauf-1 klären und dokumentieren, damit Lauf-1-Ergebnisse eindeutig einem Codestand zuordenbar sind. |

---

## Empfehlungen für Lauf-1

1. **Git-Edits entscheiden:** Entweder als Pre-Lauf-1-Commit festschreiben (dann ist Lauf-1 eindeutig dem Commit zuordenbar) oder stashen und bewusst auf `d3bf3e50` testen.
2. **Baseline-Metriken festhalten:** Vor Lauf-1 einmal `/api/v1/health/metrics` und aktuelle Sensor-Werte für `ESP_EA5484` snapshotten (als Vergleichsanker).
3. **Log-Windows öffnen:** `docker compose logs -f el-servador` + `docker compose logs -f mqtt-broker` parallel für Lauf-1-Beobachtung.
4. **`TestTimmsRegen`-Regel:** Feuert alle ~30s und landet aktuell im No-Op-Skip (desired==current). Für Live-Hartetest prüfen, ob das beabsichtigt ist oder die Regel vor Lauf-1 pausiert/angepasst werden soll.
