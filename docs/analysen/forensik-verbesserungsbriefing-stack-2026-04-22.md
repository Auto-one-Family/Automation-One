# Forensik- und Verbesserungsbriefing (Server/MQTT/Frontend)

Datum: 2026-04-22  
Scope: AutomationOne Cross-Stack (El Servador, MQTT, El Frontend)  
Modus: Erstanalyse + agentenfertiger Ausfuehrungsauftrag (kein Doppel-Fix, kein Breaking Change)

---

## 1. Executive IST Summary

Das System ist funktional und in mehreren kritischen Pfaden bereits richtig gehaertet, hat aber noch drei operative Restprobleme:

1. Offline-Erkennung ist fuer den Nutzer zu spaet (typisch 90-120s, im Worst-Case durch Timeout + Scheduler-Takt deutlich hoeher moeglich).
2. Bei konkurrierenden Regeln auf denselben Aktor entstehen zeitnahe ON/OFF-Ueberlagerungen, die UI-seitig als widerspruechliche Toast-Sequenz erscheinen.
3. Frontend-Status "Eingeschraenkt" ist technisch korrekt, aber operatorisch schwer interpretierbar.

Zusatzproblem (separat behandeln):

- Nach Reconnect liefern Bodenfeuchtesensoren initial oft `0%`; diese Werte koennen Regeln sofort triggern.

---

## 2. Was bereits korrekt funktioniert (nicht erneut anfassen)

### 2.1 LWT-Dedup-Haertung ist vorhanden
- In `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py` wird der Terminal-Authority-Key nicht mehr nur aus potenziell ungueltigem Payload-Timestamp gebaut.
- Fallback nutzt `last_seen` bzw. UTC (`_resolve_lwt_timestamp_part`), damit reale neue Disconnects nicht dauerhaft als `ts:0` stale geblockt werden.

### 2.2 Offline-Schutz in der Logic Engine ist vorhanden
- `El Servador/god_kaiser_server/src/services/logic_engine.py` markiert offline Quellsensoren und sendet OFF-Schutzaktionen im Timer-/Rule-Pfad.
- Logs belegen das:
  - `Timer OFF: rule 'Bodenfeuchte' source ESP offline (ESP_698EB4), OFF sent`

### 2.3 Konfliktmanager arbeitet fachlich
- Konfliktarbitration `first_wins` mit Gewinner-/Verlierer-Regel und Trace-ID ist aktiv.
- Frontend zeigt Konfliktmodal mit den erwarteten Feldern in `El Frontend/src/views/HardwareView.vue`.

### 2.4 Frontend-Fehlermeldung wurde bereits verbessert
- In `El Frontend/src/shared/stores/actuator.store.ts`:
  - `logic:<rule-id>` wird lesbar als `Automationsregel (<rule-id>)` angezeigt.
  - Firmware-Fehlertexte wie `Failed to turn actuator ON` werden lokalisiert.

### 2.5 Hysterese-Offline-Hold-Leak wurde geschlossen
- In `El Servador/god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py` wurde der Hold-State bei offline markierter Sensorquelle uebersteuert.
- Regressionstest vorhanden in `El Servador/god_kaiser_server/tests/unit/test_hysteresis_evaluator.py`.

---

## 3. End-to-End-Pipelines (Server-zentrisch)

## 3.1 Sensor -> Rule -> Actuator -> UI

1. ESP publiziert Sensorwerte via MQTT.
2. `sensor_handler` validiert/normalisiert/speichert in DB.
3. Logic Engine evaluiert Trigger (`evaluate_sensor_data` + timerbasierte Evaluation).
4. `ActuatorService` prueft Safety und publiziert MQTT-Command.
5. ESP antwortet mit actuator response + intent_outcome.
6. Server mapped auf WS-Events.
7. Frontend-Stores finalisieren Status/Toasts/Badges.

Relevante Dateien:
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
- `El Servador/god_kaiser_server/src/services/logic_engine.py`
- `El Servador/god_kaiser_server/src/services/actuator_service.py`
- `El Frontend/src/stores/esp.ts`
- `El Frontend/src/shared/stores/actuator.store.ts`

## 3.2 Disconnect/Offline-Pipeline

1. Primar: MQTT LWT (`.../system/will`) -> `lwt_handler`.
2. Sekundaer: Heartbeat-Timeout in `heartbeat_handler.check_device_timeouts()`.
3. Maintenance Scheduler triggert Health Check periodisch (`health_check_esps`).
4. Bei Offline:
   - `esp_health` WS offline wird gesendet.
   - Logic Engine OFF-Gates greifen fuer Rules mit offline Sensorquelle.

Relevante Dateien:
- `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- `El Servador/god_kaiser_server/src/services/maintenance/service.py`

## 3.3 Frontend-Status- und Degradationspipeline

- Connectivity-Status (`online/stale/offline`) in `El Frontend/src/composables/useESPStatus.ts`.
  - `HEARTBEAT_STALE_MS = 90_000`
  - `HEARTBEAT_OFFLINE_MS = 300_000`
- Runtime-Degradation ("Eingeschraenkt") wird separat aus `runtime_health_view` abgeleitet:
  - `El Frontend/src/domain/esp/espHealth.ts`
  - Badge erscheint nur bei `online|stale` + Degradation-Marker.

Wichtig:
- "Eingeschraenkt" ist derzeit **kein** direkter Offline-Zustand, sondern Runtime-/Network-/Circuit-Breaker-Degradationssignal.

---

## 4. Forensischer Befund aus Logs (letzte Runs)

### 4.1 Beobachtete Sequenz

- `ESP_698EB4` verliert Verbindung.
- Danach werden wiederholt `Timer OFF ... source ESP offline` geloggt.
- Gleichzeitig triggert `Bodenfeuchte 2` weiterhin ON-Versuche auf `ESP_6B27C8:25`.
- Dadurch entstehen im Frontend kurz nacheinander:
  - pending/accepted
  - failed (z.B. Correlation `43b272fa-...`)
  - applied/success (z.B. Correlation `7b928246-...`)

Das ist kein einzelner Frontend-Bug, sondern eine Cross-Layer Race/Ueberlagerung konkurrierender Regelpfade.

### 4.2 Konfliktlage in Regeln

In der DB sind zwei aktive Regeln auf denselben Aktor vorhanden:

- `f95b107d-abfb-46b4-adaa-f0e53f3fd959` (`Bodenfeuchte 2`, Prioritaet 5)
- `fc79152b-dc43-44e9-a1b4-106b2e4d12b1` (`Bodenfeuchte`, Prioritaet 10)

Beide referenzieren dieselbe Sensorquelle (`ESP_698EB4`, moisture) und dasselbe Aktorziel (`ESP_6B27C8:25`).

Folge:
- Konfliktmanager entscheidet korrekt (`first_wins`), aber die Eventfolge bleibt fuer den Nutzer noisy.

---

## 5. Performance-/Latenzbefund Offline/Online

## 5.1 Konfigurationsrealitaet

Backend:
- `HEARTBEAT_TIMEOUT_SECONDS = 180` (Default) in `El Servador/god_kaiser_server/src/core/config.py`
- `ESP_HEALTH_CHECK_INTERVAL_SECONDS = 60` (Default) in `.../config.py`
- Health-Checks laufen ueber Scheduler in `.../services/maintenance/service.py`

Frontend:
- `stale` ab 90s und `offline` erst ab 300s fallback-seitig in `El Frontend/src/composables/useESPStatus.ts`.

## 5.2 Warum 90-120s im Feld beobachtet werden

Trotz 180s Timeout sieht der Nutzer oft frueher "eingeschraenkt"/stale, aber noch nicht offline:

- 90s: Frontend stale-Schwelle.
- 180s + bis zu 60s Scheduler-Jitter: serverseitiger Offline-Flip.
- Danach weitere Verzahnung von Timer-Evaluation/Actuator-Terminalevents.

Damit sind die beobachteten Phasen plausibel:
- erst eingeschraenkt/stale,
- spaeter offline,
- OFF-Wirkung sichtbar erst nach naechster relevanter Logic/Terminal-Sequenz.

---

## 6. Separates Problem: Reconnect mit initial 0%-Werten

Symptom:
- Nach Neustart der Sensor-ESPs kommen initial oft `0%` Bodenfeuchte.
- Diese Werte triggern Regeln direkt (fachlich oft unerwuenscht).

Empfohlene Trennung:
- Dieses Thema separat vom Offline-Latenzthema behandeln.
- Nicht pauschal 0-Werte verbieten (koennen in Einzelfaellen real sein), sondern Bootstrap-/Qualitaetsfenster sauber definieren.

Moegliche Loesungsrichtungen (nur nach Beleglauf):
- kurzer reconnect bootstrap hold per sensor source + quality/age markers,
- First-N-Messages Filter nur fuer klar markierte startup-phases,
- oder domain-spezifische guard condition (ohne globale Sensordatenpipeline zu brechen).

---

## 7. Frontend-Truth-Check: was genau zu pruefen ist

Pflichtpruefung mit Playwright gegen reale Ereignisse:

1. Statuspfad pro Device:
   - `online -> stale/eingeschraenkt -> offline -> reconnect -> online`
2. Konfliktmodal:
   - Gewinner/Verlierer/Trace-ID korrekt zur Server-Arbitration?
3. Toast-Finalitaet:
   - pro Korrelation nur die korrekten terminalen Aussagen, keine semantischen Widersprueche.
4. Runtime-Health-Badge:
   - "Eingeschraenkt" mit klarer Ursache/Operator-Hinweis verknuepft?
5. Reconnect-0%-Sonderfall:
   - wann angezeigt, wann regelwirksam, wann wieder normalisiert.

---

## 8. Agentenfertiger Befehl (copy/paste)

```text
AUFTRAG: Cross-Stack Forensik + Frontend Truth Audit (nur Analyse, noch keine Implementierung)

NUTZE AGENTEN/SKILLS:
- /server-debug
- /mqtt-debug
- /frontend-debug
- /server-development
- /frontend-development
- Playwright fuer UI-Live-Audit
- optional /meta-analyst fuer konsolidierten Handoff

ZEITFENSTER:
- Immer letzte 10 Minuten
- Ich trenne gleich manuell Sensor-ESP und starte wieder

FOKUS:
- Sensorquelle: ESP_698EB4
- Aktorziel: ESP_6B27C8 GPIO 25
- Regeln: f95b107d-abfb-46b4-adaa-f0e53f3fd959 und fc79152b-dc43-44e9-a1b4-106b2e4d12b1

PFLICHT-ARTEFAKTE:
1) Timeline mit festen Markern:
   disconnect_start
   first_lwt
   first_esp_health_stale
   first_esp_health_offline
   first_timer_off
   first_actuator_terminal_event
   reconnect_start
   first_esp_health_online
   first_sensor_value
   first_nonzero_sensor_value

2) Korrelationstabelle:
   correlation_id -> accepted -> terminal (failed/applied) -> issued_by -> actuator_result

3) UI-vs-Server Truth Matrix:
   pro Zeitpunkt: server state vs ws payload vs frontend badge/toast/modal

4) Latenzanalyse:
   wo die Offline-Verzoegerung entsteht (LWT, heartbeat_timeout, scheduler tick, ws/store, ui mapping)

5) Separates Problemblatt:
   reconnect 0%-Werte, Trigger-Impact, befundbasierte Loesungsoptionen ohne Breaking Changes

LEITPLANKEN:
- Keine Doppel-Fixes auf bereits funktionierende Pfade
- Keine Umgehung von ActuatorService Safety
- Keine Contract-Aufweichung
- Jede Aussage mit Log- und Codebeleg
- Ergebnisformat: IST, Problemcluster, Root-Cause, minimal-invasive Loesungswege, Regression-Risiken
```

---

## 9. Priorisierte Verbesserungslinien (nach Analysefreigabe)

P1:
- Offline/Online-Latenz verbessern (schnellere Device-State Transition ohne Flapping-Breakage)
- Frontend-Operatorik fuer "Eingeschraenkt" (konkrete Handlungsinfo statt nur Label)

P2:
- Konflikt-/Toast-Rauschreduktion in ueberlagerten Regelpfaden
- Reconnect-0%-Bootstrap-Handling fuer Bodenfeuchte

Update 2026-04-22 (AUT-123 / INC-2204-08):
- Frontend-Toast-Finalitaet fuer Aktor-Lifecycle gehaertet: pro `correlation_id` wird genau ein terminaler UI-Ausgang zugelassen (success/failed/timeout), auch wenn terminale Events aus mehreren Quellen nahe beieinander eintreffen.
- Bestehendes Pattern bleibt erhalten: zuerst accepted/pending, terminale Aussage erst bei finalem Event bzw. Timeout.

Update 2026-04-22 (AUT-124 / INC-2204-09):
- Runtime-Health-Status `Eingeschraenkt` operatorisch aufgeloest: bestehende Badge/Tooltip/Details-Pfade nutzen jetzt menschenverstaendliche Ursache (Reason-Code-Mapping + Priorisierung) und konkreten naechsten Schritt.
- Offline-Semantik bleibt getrennt: Runtime-Health-Badge nur bei `online|stale`; `offline` bleibt ein eigener Statuspfad.

---

## 10. Verifikation (Pflicht fuer jeden spaeteren Fix)

Backend:
- `pytest` (mindestens betroffene Unit + Integration)
- relevante Logik-/MQTT-/LWT-Tests

Frontend:
- vitest fuer Stores/Mapper
- Playwright-Ende-zu-Ende gegen reproduziertes Offline/Online-Szenario

System:
- Vorher/Nachher Timeline mit identischen Markern
- nachweislich keine Regression in:
  - LWT-Dedup
  - Hysterese-offline-guard
  - Konfliktarbitration
  - terminaler Intent-Verarbeitung

---

## 11. Addendum 2026-04-24 (AUT-134/EA-132)

Im Incident-Run `INC-2026-04-24-aut134-config-resync-oversize` sind zwei zusammenhaengende, aber technisch getrennte Oversize-Pfade bestaetigt worden:

- **Config-Oversize (4096):** `intent_outcome rejected`, `VALIDATION_FAIL`,  
  `reason=[CONFIG] Payload too large: 4164 bytes, max=4096`, CID `f9f74534-5c3a-4735-876f-4c3132cec644`.
- **Heartbeat-Oversize (1024):** COM3-Serial zeigt mehrfach `payload_len=1225..1229` mit Queue-Drop/Circuit-Breaker-Folgekette.

Operatorische Konsequenz:
- Ursache und Endzustand muessen im Frontend als **terminaler Config-Reject** getrennt von Runtime-Health (`Eingeschraenkt`) sichtbar werden.

Forensik-Konsequenz:
- CID-first-Korrelation beibehalten.
- Fehlende Docker-Raw-Logs (gleiches Zeitfenster fuer Server/Broker/Alloy) als BLOCKER deklarieren statt Annahmen zu treffen.

