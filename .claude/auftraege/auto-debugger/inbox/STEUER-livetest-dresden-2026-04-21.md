---
run_mode: incident
incident_id: livetest-dresden-2026-04-21
run_id: livetest-dresden-2026-04-21
order: incident_first
target_docs: []
scope: |
  Live-Hartetest im Robin-Heimlabor (Dresden) — ESP32 + El Servador + El Frontend gleichzeitig
  scharf schalten und durch die Auto-one-Agenten korrelativ debuggen.

  Fokusbereiche:
  A) Sensor-Latenz: publish-to-frontend end-to-end < 2s bei QoS 1, Heartbeat alle 30s.
     Korrelation: ESP32-Serial-Zeitstempel → mosquitto SYS-Topics → Server sensor_data insert → Frontend-WS-Frame.
  B) Aktor-Antwortzeit: Kommando bis OK-Bestaetigung < 500ms (Relay, Valve, Pump, PWM).
     Korrelation: Frontend-Klick → WS-Command → Server publish → ESP32-Serial actuator set → Rueckmeldung.
     Heizungs-Relay default off; Hardware-Cutoff-Mechanismus separat pruefen.
  C) LWT & Reconnect-Verhalten: Bei MQTT-Verbindungsverlust → Heizungs-Relay server-seitig auf off (fail-safe);
     LWT-Topic zeigt offline. Test: mosquitto 30s trennen → Reaktion.
  D) Logic-Engine Cross-ESP: Regel feuert < 1s bei Schwellwert-Treffer; pausiert bei Sensor-Stale > 90s.
     Dry-Run: Bodenfeuchte < 20% → Pumpe 2s (OHNE Heizung).

  Lauf-Struktur gemaess AUT-108:
  - Lauf-0: system-control Briefing (STATE-LAUF0.md)
  - Lauf-1: esp32-debug + server-debug + mqtt-debug + frontend-debug (parallel)
  - Lauf-2: auto-debugger Korrelation → TASK-PACKAGES.md; optional db-inspector
  - Lauf-3: verify-plan Gate → VERIFY-PLAN-REPORT.md → TASK-PACKAGES anpassen → SPECIALIST-PROMPTS.md
  - Lauf-4: Dev-Agents parallel (nur auf auto-debugger/work)
  - Lauf-5: test-log-analyst → Commit

  Linear-Issue: AUT-108 (https://linear.app/autoone/issue/AUT-108)
  Faelligkeitsdatum: 2026-04-21
forbidden: |
  - Kein Commit auf master; nur Branch auto-debugger/work.
  - Kein Port-Forward von Applikationsports nach aussen.
  - Keine Secrets (MQTT-Passwort, DB-Passwort, API-Keys) ins Repo.
  - Keine destruktiven DB-Aktionen (db-inspector nur lesend).
  - Heizungs-Live-Phase (P3) NUR wenn 11-Punkte-Checkliste aus AUT-102 vollstaendig abgehakt.
  - Keine Breaking Changes an REST/MQTT/WS/DB-Schema ohne separates Gate.
  - Keine direkten Implementierungen ohne verify-plan-Gate.
done_criteria: |
  1. STATE-LAUF0.md: 14 Container healthy, ESP32 bootet sauber, Frontend laedt.
  2. Drei+ Lauf-1-Artefakte liegen vor (esp32-, server-, mqtt-logs; frontend-HAR).
  3. TASK-PACKAGES.md: pro Symptom eine Hypothese mit Evidenz-Zitat (Datei:Zeile).
  4. VERIFY-PLAN-REPORT.md: GRUEN oder dokumentierter GELB/ROT-Beschluss mit Plan-Anpassung.
  5. Dev-Agenten-Fixes nur auf auto-debugger/work; je pio run / pytest / npm run build gruen.
  6. FEHLER-REGISTER.md vollstaendig fuer alle 5 Testphasen (P0-P4); Ampel-Scorecard.
  7. Linear-Kommentar mit Kurz-Resultat pro Lauf an AUT-108.
---

# Steuerdatei — Live-Hartetest Dresden 2026-04-21

> **Linear-Issue:** [AUT-108](https://linear.app/autoone/issue/AUT-108)  
> **Branch:** `auto-debugger/work`  
> **Artefakt-Ordner:** `.claude/reports/current/incidents/livetest-dresden-2026-04-21/`

## Kontext

Live-Hartetest im Robin-Heimlabor (Dresden). Alle drei Schichten (ESP32 + El Servador + El Frontend)
gleichzeitig scharf schalten. Ziel: korrelative Analyse ueber 4 Fokusbereiche A–D.

Trigger-Quelle: AUT-102 (Hartetest-Pre-Check bei Christoph).

## Log-Quellen

| Schicht | Quelle | Ziel-Artefakt |
|---------|--------|---------------|
| ESP32 Serial | `pio device monitor` / `el-trabajante-serial-2026-04-21.log` | ESP32-SERIAL-LAUF1.log |
| Server | `docker compose logs god_kaiser --tail=2000 --since=30m` | SERVER-LOG-LAUF1.log |
| MQTT | `docker compose logs mosquitto --tail=2000` | MOSQUITTO-LOG-LAUF1.log |
| Frontend | Browser DevTools HAR (10min L2 OrbitalView) | FRONTEND-DEVTOOLS-LAUF1.har |
| DB (on demand) | `db-inspector` lesend | DB-INSPECT-LAUF2.md |

## Fokusbereich A — Sensor-Latenz

- **SOLL:** publish-to-frontend end-to-end < 2s, QoS 1, Heartbeat alle 30s
- **Korrelation:** ESP32-Serial-Zeitstempel → mosquitto `$SYS/broker/publish/messages/sent` → Server `sensor_data insert` → Frontend WS-Frame

## Fokusbereich B — Aktor-Antwortzeit

- **SOLL:** Kommando bis OK-Bestaetigung < 500ms (Relay, Valve, Pump, PWM)
- **Heizungs-Relay:** default off; Hardware-Cutoff getrennt pruefen

## Fokusbereich C — LWT & Reconnect

- **SOLL:** Bei MQTT-Trennung → Heizungs-Relay server-seitig auf off (fail-safe)
- **Test:** mosquitto willkuerlich 30s trennen

## Fokusbereich D — Logic-Engine

- **SOLL:** Regel feuert < 1s bei Schwellwert; pausiert bei Stale > 90s
- **Dry-Run:** Bodenfeuchte < 20% → Pumpe 2s (OHNE Heizung)

## Inhaltliche Notizen

<!-- Symptome / auffaellige Logs / Fehler-Codes hier eintragen waehrend des Tests -->
<!-- Heizungs-Live-Phase P3: erst nach vollstaendiger 11-Punkte-Checkliste aus AUT-102 -->
