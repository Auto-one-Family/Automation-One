# Paket 06 - Server Runtime States und Betriebsmodi (El Servador)

Stand: 2026-04-03  
Scope: Produktiver Backend-Runtime-Pfad unter `El Servador/god_kaiser_server/src/` (Analyse, keine Codeaenderung)

## 1. Scope und Runtime-Begriffe

Diese Analyse modelliert den **realen Laufzeitzustand** des Servers als State-Machine ueber den gesamten Prozess-Lebenszyklus (Startup, Betrieb, Degradation, Resync, Shutdown) und nicht nur ueber einzelne Health-Endpunkte.

### 1.1 Modellgrenzen

- Im Scope:
  - FastAPI-Lifespan-Orchestrierung (`main.py`)
  - DB-/MQTT-/WebSocket-Lifecycle
  - LogicEngine/LogicScheduler
  - CentralScheduler + Maintenance + Simulation Recovery
  - Reconnect/Resync-Pfade (Heartbeat, ACK-Bridge, Full-State-Push, Config-Push)
- Nicht im Scope:
  - Infrastruktur ausserhalb des Prozesses (Broker/DB selbst)
  - Frontend-Runtime
  - Firmware-Runtime

### 1.2 Kanonisches Zustandsmodell (Pflichtmodell)

| State-ID | State-Name | Kurzdefinition |
|---|---|---|
| `SRV-STATE-001` | `COLD_START` | Prozess lebt noch nicht im operativen Modus; Startup-Preconditions laufen oder sind noch nicht erfuellt. |
| `SRV-STATE-002` | `WARMING_UP` | Kernkomponenten werden initialisiert, APIs sind noch nicht als betriebsbereit zu interpretieren. |
| `SRV-STATE-003` | `NORMAL_OPERATION` | Kernpfade laufen stabil: DB verfuegbar, zentrale Services aktiv, Runtime nimmt regulaeren Traffic an. |
| `SRV-STATE-004` | `DEGRADED_OPERATION` | Prozess lebt, aber mindestens ein kritischer Teilpfad ist eingeschraenkt (z. B. MQTT weg, Scheduler-/Service-Luecke, offene Breaker). |
| `SRV-STATE-005` | `RECOVERY_SYNC` | Nach Reconnect/Restart laeuft gezielte Nachsynchronisation (State-Push, Config-Push, Rule-Reevaluation, Job-Recovery). |
| `SRV-STATE-006` | `SHUTDOWN_DRAIN` | Geordneter Stopp laeuft; neue Arbeit soll nicht aufgebaut, laufende Arbeit soll kontrolliert beendet werden. |

### 1.3 Mapping von IST-Signalen auf das kanonische Modell

| IST-Signal/Begriff | Quelle | Mapping |
|---|---|---|
| Startup-Logs "Starting..."/"Started Successfully" | `main.py` Lifespan | `COLD_START` -> `WARMING_UP` -> (`NORMAL_OPERATION` oder `DEGRADED_OPERATION`) |
| `/health` = `healthy` | Root-Health in `main.py` | nur Teilsignal; kann `NORMAL_OPERATION` oder `RECOVERY_SYNC` sein |
| `/health` = `degraded` | Root-Health in `main.py` | Teilsignal; meist `DEGRADED_OPERATION`, ggf. kurz in `RECOVERY_SYNC` |
| `/api/v1/health/ready.ready=true` | Readiness-Probe | notwendige, aber nicht hinreichende Bedingung fuer `NORMAL_OPERATION` |
| MQTT reconnect + re-subscribe + buffer flush + reconnect-eval | `mqtt/client.py`, `heartbeat_handler.py`, `logic_engine.py` | `RECOVERY_SYNC` |
| Lifespan-Shutdown-Sequenz | `main.py` | `SHUTDOWN_DRAIN` |

Kernaussage: Health-Endpunkte sind Observability-Snapshots, aber keine vollstaendige Runtime-State-Machine.

---

## 2. Start-/Stop-Lifecycle

## 2.1 Startsequenz (Ist-Pfad, geordnet)

| Schritt | Lifecycle-ID | Trigger | Ergebnis | Kritikalitaet |
|---|---|---|---|---|
| 0 | `SRV-LIFE-START-000` | Prozessstart/ASGI Lifespan Start | Security-Checks (JWT/TLS-Warnung), Resilience-Registry | hoch |
| 1 | `SRV-LIFE-START-001` | `database.auto_init` | DB init/engine, DB-Circuit-Breaker aktiv | kritisch |
| 2 | `SRV-LIFE-START-002` | MQTT Connect Versuch | verbunden oder fallback mit Auto-Reconnect | kritisch |
| 3 | `SRV-LIFE-START-003` | Handler-Registrierung | Subscriber/Handler aktiv, Main-Loop gebunden | kritisch |
| 4 | `SRV-LIFE-START-004` | Scheduler-Aufbau | CentralScheduler + Simulation + Maintenance + Monitoring/Backup/Plugin-Jobs | hoch |
| 5 | `SRV-LIFE-START-005` | Recovery-Schritte | Mock-Recovery, orphan cleanup, sensor schedule recovery, plugin sync | hoch |
| 6 | `SRV-LIFE-START-006` | Runtime-Kernservices | WebSocket init, Safety/Actuator/LogicEngine/LogicScheduler start | kritisch |
| 7 | `SRV-LIFE-START-007` | Abschluss | Startup successful, Lifespan `yield` (App serving) | kritisch |

### Startup-Interpretation fuer Runtime-State

- `COLD_START`: bis vor DB/Resilience-Basis.
- `WARMING_UP`: ab DB-Init bis nach erfolgreichem Start der Kernservices.
- Endzustand nach Warm-up:
  - `NORMAL_OPERATION`, wenn Kernpfade verfuegbar.
  - `DEGRADED_OPERATION`, wenn Server lebt, aber Teilpfade initial nicht verfuegbar (typisch MQTT disconnected beim Start).

## 2.2 Stop-/Restart-Sequenz (Ist-Pfad, geordnet)

| Schritt | Lifecycle-ID | Aktion | Drain/Stop-Verhalten |
|---|---|---|---|
| 1 | `SRV-LIFE-STOP-001` | LogicScheduler stoppen | verhindert neue timergetriebene Rule-Evaluation |
| 2 | `SRV-LIFE-STOP-002` | LogicEngine stoppen | beendet Evaluationsloop kontrolliert |
| 3 | `SRV-LIFE-STOP-003` | SequenceExecutor + MQTTCommandBridge shutdown | laufende Cleanup-Tasks/Futures werden beendet/cancelled |
| 4 | `SRV-LIFE-STOP-004` | MaintenanceService stoppen | monitor_/maintenance_ Jobs werden entfernt |
| 5 | `SRV-LIFE-STOP-005` | Mock-Simulationen stoppen, dann CentralScheduler shutdown | Jobgraph wird kontrolliert entfernt |
| 6 | `SRV-LIFE-STOP-006` | WebSocket shutdown | Connections geschlossen, Runtime-Registry geleert |
| 7 | `SRV-LIFE-STOP-007` | Subscriber Threadpool shutdown | pending Handler-Arbeit wird beendet/abgebrochen (executor shutdown) |
| 8 | `SRV-LIFE-STOP-008` | MQTT offline-status publish + disconnect | retained "offline" fuer Serverstatus; Netzwerkloop stoppt |
| 9 | `SRV-LIFE-STOP-009` | DB engine dispose | Connections frei, Prozess verlassbar |

### Geordneter Shutdown-Charakter

- Es gibt **echtes Drain-Verhalten** fuer zentrale Worker (Scheduler/Engine/Bridge/WS/Subscriber).
- Harte Garantien fuer "alles persistiert" existieren nicht in allen Nebenkanaelen (z. B. WS best effort), aber Kernstop ist geordnet.

---

## 3. Vollstaendige State-Machine

## 3.1 State-Definitionen mit Entry/Exit

| State-ID | Name | Entry-Bedingung | Laufzeit-Invariante | Exit-Bedingung |
|---|---|---|---|---|
| `SRV-STATE-001` | `COLD_START` | Prozess/Lifespan startet | keine API-Bereitschaft garantierbar | Start-Prechecks passiert -> `WARMING_UP` |
| `SRV-STATE-002` | `WARMING_UP` | Startupsequenz aktiv | Komponenten werden schrittweise aufgebaut | Kernservices stehen -> `NORMAL_OPERATION` oder `DEGRADED_OPERATION` |
| `SRV-STATE-003` | `NORMAL_OPERATION` | Kernpfade verfuegbar, keine kritische Degradation | API + Worker + Scheduling im Sollbetrieb | Teilpfadverlust -> `DEGRADED_OPERATION`; Reconnect-/Resync-Workflow -> `RECOVERY_SYNC`; Stop-Signal -> `SHUTDOWN_DRAIN` |
| `SRV-STATE-004` | `DEGRADED_OPERATION` | Prozess lebt, aber mindestens ein kritischer Pfad degradiert | reduzierte Betriebsfaehigkeit, kontrollierte Teilfunktion | Stabilisierung -> `NORMAL_OPERATION`; gezielte Nachsynchronisation -> `RECOVERY_SYNC`; Stop-Signal -> `SHUTDOWN_DRAIN` |
| `SRV-STATE-005` | `RECOVERY_SYNC` | Reconnect/Restart-Resync aktiv | Reconciliation laeuft (MQTT re-subscribe, state/config push, rule/job recovery) | Resync erfolgreich -> `NORMAL_OPERATION`; Fehler/Teilversagen -> `DEGRADED_OPERATION`; Stop-Signal -> `SHUTDOWN_DRAIN` |
| `SRV-STATE-006` | `SHUTDOWN_DRAIN` | geordneter Shutdown gestartet | keine neuen Kernjobs, laufende Loops werden beendet | Prozessende |

## 3.2 ASCII-State-Diagramm

```text
SRV-STATE-001 COLD_START
   -> SRV-STATE-002 WARMING_UP
      -> SRV-STATE-003 NORMAL_OPERATION
      -> SRV-STATE-004 DEGRADED_OPERATION

SRV-STATE-003 NORMAL_OPERATION
   -> SRV-STATE-004 DEGRADED_OPERATION
   -> SRV-STATE-005 RECOVERY_SYNC
   -> SRV-STATE-006 SHUTDOWN_DRAIN

SRV-STATE-004 DEGRADED_OPERATION
   -> SRV-STATE-005 RECOVERY_SYNC
   -> SRV-STATE-003 NORMAL_OPERATION
   -> SRV-STATE-006 SHUTDOWN_DRAIN

SRV-STATE-005 RECOVERY_SYNC
   -> SRV-STATE-003 NORMAL_OPERATION
   -> SRV-STATE-004 DEGRADED_OPERATION
   -> SRV-STATE-006 SHUTDOWN_DRAIN
```

## 3.3 Ungueltige/gefaehrliche Transitionen

| Transition | Einstufung | Begruendung |
|---|---|---|
| `COLD_START -> NORMAL_OPERATION` ohne `WARMING_UP` | ungueltig | umgeht Initialisierungs- und Guard-Schritte |
| `SHUTDOWN_DRAIN -> NORMAL_OPERATION` im selben Lifespan-Zyklus | ungueltig | es gibt keinen re-entry Pfad ohne neuen Prozessstart |
| `DEGRADED_OPERATION -> NORMAL_OPERATION` ohne Re-Check kritischer Guards | gefaehrlich | "false green", besonders bei MQTT/Worker-Luecken |
| `RECOVERY_SYNC -> NORMAL_OPERATION` bei offenen ACK-Timeout-Lagen | gefaehrlich | moegliche state/config-inkonsistenz trotz scheinbar gesundem API |

---

## 4. Trigger-Guard-Action-Matrix

| Transition-ID | Current | Event/Trigger | Guard | Action | Next |
|---|---|---|---|---|---|
| `SRV-TR-001` | `COLD_START` | Lifespan startup beginnt | Prozess lebt | Security + Resilience init | `WARMING_UP` |
| `SRV-TR-002` | `WARMING_UP` | DB init erfolgreich | Engine/Session verfuegbar | DB breaker init, Startup fortsetzen | `WARMING_UP` |
| `SRV-TR-003` | `WARMING_UP` | MQTT initial connected | Subscriber/Handler registriert | subscribe_all + weitere Services | `WARMING_UP` |
| `SRV-TR-004` | `WARMING_UP` | MQTT initial disconnected | Server darf ohne MQTT starten | Startup fortsetzen mit reconnect-faehigem client | `DEGRADED_OPERATION` |
| `SRV-TR-005` | `WARMING_UP` | Kernservices gestartet (WS, LogicEngine, LogicScheduler) | keine fatalen Exceptions | Lifespan `yield`, API serving | `NORMAL_OPERATION` |
| `SRV-TR-006` | `NORMAL_OPERATION` | MQTT disconnect / breaker open / kritischer Workerverlust | Prozess lebt weiter | Warnen, degrade markieren, auto-reconnect/monitoring aktiv | `DEGRADED_OPERATION` |
| `SRV-TR-007` | `DEGRADED_OPERATION` | MQTT reconnect callback | Subscriber vorhanden | re-subscribe + offline-buffer flush | `RECOVERY_SYNC` |
| `SRV-TR-008` | `RECOVERY_SYNC` | Heartbeat-Reconnect erkannt (`is_reconnect`) | Device online commit erfolgt | invalidate_offline_backoff + reconnect rule eval + full-state-push task | `RECOVERY_SYNC` |
| `SRV-TR-009` | `RECOVERY_SYNC` | Resync erfolgreich abgeschlossen | keine kritischen offenen Fehlerindikatoren | Betrieb normalisieren | `NORMAL_OPERATION` |
| `SRV-TR-010` | `RECOVERY_SYNC` | ACK-/Push-/Recovery-Fehler bleibt bestehen | kritische Luecke bleibt | degraded weiterfahren, keine false-normal promotion | `DEGRADED_OPERATION` |
| `SRV-TR-011` | `NORMAL_OPERATION` | Shutdown-Signal | Lifespan stop startet | geordnete Stop-Sequenz starten | `SHUTDOWN_DRAIN` |
| `SRV-TR-012` | `DEGRADED_OPERATION` | Shutdown-Signal | Lifespan stop startet | geordnete Stop-Sequenz starten | `SHUTDOWN_DRAIN` |
| `SRV-TR-013` | `RECOVERY_SYNC` | Shutdown-Signal waehrend Resync | Lifespan stop startet | Futures canceln, Jobs/Loops stoppen | `SHUTDOWN_DRAIN` |

Hinweis: Einige Trigger sind komponentenintern (MQTT callback, heartbeat side-effects), wirken aber global auf den Betriebsmodus.

---

## 5. Health/Worker/Background-Service-Mapping

## 5.1 Health-Signale vs Runtime-State

| Signal | Quelle | Aussagekraft | Erlaubte Runtime-States |
|---|---|---|---|
| `/health.status=healthy` | Root-Endpoint | MQTT ist verbunden; keine vollstaendige Workerpruefung | `NORMAL_OPERATION`, `RECOVERY_SYNC` |
| `/health.status=degraded` | Root-Endpoint | MQTT disconnected | `DEGRADED_OPERATION`, `RECOVERY_SYNC` |
| `/api/v1/health/ready.ready=true` | Readiness | DB+MQTT ok, Diskcheck ok | `NORMAL_OPERATION` (primaer), ggf. spaetes `RECOVERY_SYNC` |
| `/api/v1/health/live.alive=true` | Liveness | Prozess lebt | alle ausser Prozessende |
| `/api/v1/health/detailed.status` | Detailed Health | erweitert um breaker/system warnings | `NORMAL_OPERATION` oder `DEGRADED_OPERATION` je nach warnings |

## 5.2 Worker-/Servicezustand und Modusfreigabe

| Komponente | Soll fuer `NORMAL_OPERATION` | Ausfallwirkung | Zielmodus |
|---|---|---|---|
| DB Engine + Session | muss verfuegbar sein | keine persistente Kernverarbeitung moeglich | `DEGRADED_OPERATION` (bis kritisch) |
| MQTT Client + Subscriber | sollte verbunden und subscribed sein | keine Ingestion/Dispatch ueber MQTT | `DEGRADED_OPERATION` |
| LogicEngine | muss laufen fuer Automation | Regeln laufen nicht, nur statische APIs | `DEGRADED_OPERATION` |
| LogicScheduler | muss laufen fuer time-window Regeln | timergetriebene Regeln fehlen | `DEGRADED_OPERATION` |
| CentralScheduler | sollte laufen | maintenance/monitor/recovery-jobs fehlen | `DEGRADED_OPERATION` |
| MaintenanceService | sollte registriert sein | health/cleanup observability sinkt | `DEGRADED_OPERATION` |
| WebSocketManager | optional fuer Core-Safety, wichtig fuer Realtime-UI | keine Push-Events, Backend-Kern weiter moeglich | `DEGRADED_OPERATION` (teilweise gesund) |

## 5.3 Definition "teilweise gesund"

Der Server gilt als **teilweise gesund** (degraded), wenn:

- Prozess lebt und API antwortet,
- aber mindestens ein kritischer Teilpfad eingeschraenkt ist (haeufig MQTT oder Worker-Luecke),
- und Kerninvarianten nur eingeschraenkt erfuellt werden.

Erlaubte Operationen in teilweise gesund:

- Read-lastige API-Operationen,
- DB-gebundene Admin-/Konfig-Operationen (wenn DB stabil),
- eingeschraenkte Runtime-Operationen mit klaren Warnungen.

Nicht als voll gesund freizugeben:

- Zustand mit offenen Reconnect-/Resync-Luecken,
- Zustand mit gestopptem Logic-Kern bei erwarteter Automation.

---

## 6. Restart-/Resync-Risiken (Top 10)

Priorisierung: `P1` = hochkritisch, `P2` = hoch, `P3` = mittel.

1. **`P1` - False-Normal nach Reconnect ohne vollstaendige Resync-Abnahme**  
   MQTT kann wieder "connected" sein, waehrend Full-State-Push oder Config-Reconciliation noch nicht konsistent abgeschlossen ist.

2. **`P1` - Doppelte Verarbeitung bei Restart/Rejoin in randnahen Zeitfenstern**  
   QoS/Retry/Re-Heartbeat koennen bei gleichzeitigen Recovery-Tasks doppelte Side-Effects erzeugen (z. B. erneute Config-/State-Pushes).

3. **`P1` - Verpasste Inbound-Ereignisse bei DB-Breaker offen**  
   Inbound MQTT hat keine durable serverseitige Eingangsqueue; bei DB-Ausfall gehen Events verloren.

4. **`P2` - Stale In-Memory-Caches nach Teilwiederanlauf**  
   Z. B. Context-Cache (`DeviceScopeService`, TTL 30s) oder transienter Runtime-State kann zeitlich hinter DB-Realitaet liegen.

5. **`P2` - Teilwiederanlauf einzelner Worker ohne globales Runtime-Gate**  
   Health kann gruen erscheinen, obwohl z. B. LogicScheduler oder Maintenance nicht (mehr) voll aktiv sind.

6. **`P2` - ACK-getriebene Operationen mit Timeout-Fallbacks**  
   Bei ausbleibenden ACKs bleiben Zone/Subzone-/Resync-Zustaende potentiell unvollstaendig.

7. **`P2` - Reconnect-Race zwischen Heartbeat, Timeout-Job und LWT**  
   Statuswechsel online/offline koennen in engen Fenstern konkurrieren; falsche Zwischenzustaende sind moeglich.

8. **`P3` - Realtime-Kanalverlust (WebSocket) bei weiterlaufendem Kern**  
   Fachlich persistiert vieles korrekt, aber operatorische Sicht/Alarmierung kann lueckenhaft sein.

9. **`P3` - Mock/Simulation-Recovery beeinflusst Scheduler-Lage**  
   Bei vielen Recoveries kann Scheduler-Last und Reihenfolge sensibel sein; produktive Signale koennen verzerrt wirken.

10. **`P3` - Stale retained-Nachrichten als Wiederanlaufrauschen**  
    Es gibt aktive Cleanup-Mechanismen (z. B. retained emergency/LWT), aber unvollstaendige Brokerbereinigung kann alte Signale re-injizieren.

### Cold Start vs Prozessrestart vs Teilwiederanlauf

- **Cold Start:** kompletter Aufbau aller Runtime-Komponenten; hohes Risiko fuer Initialisierungsreihenfolge.
- **Prozessrestart:** plus Recovery-Schritte (Mocks, Schedules, plugin schedules, reconnect logic); hohes Resync-Risiko.
- **Teilwiederanlauf einzelner Services:** gefaehrlichste Grauzone, weil globale Betriebsmode-Guards fehlen koennen (de-facto degrade statt hard fail).

---

## 7. Hand-off in P2.7 und Paket 5 Gesamtintegration

## 7.1 Hand-off P2.7 (Governance/Contracts)

- Runtime-State als verbindliches Referenzmodell (`SRV-STATE-001..006`) in Architektur- und Ops-Doku verankern.
- Einheitliche Guard-Kriterien fuer "Promotion nach NORMAL_OPERATION" definieren (nicht nur MQTT connected).
- Transition-Observability standardisieren: pro Transition strukturierte Events/IDs (`SRV-TR-*`) in Logs/Metriken.
- Invalid-Transition-Policy festlegen (z. B. keine `RECOVERY_SYNC -> NORMAL_OPERATION` ohne Resync-Checks).

## 7.2 Hand-off Paket-5-Gesamtintegration (Cross-Layer)

- Servermodus explizit an Frontend und Device-Interaktionen koppeln:
  - Frontend soll `DEGRADED_OPERATION` und `RECOVERY_SYNC` getrennt visualisieren.
  - Firmware-/Device-relevante Reconnect-Ereignisse sollen auf serverseitige Mode-Transitions gemappt werden.
- End-to-End-Rejoin-Tests aufnehmen:
  - Broker down/up waehrend Last
  - DB breaker open/close
  - Restart mit pending Zone/Subzone ACK
  - Restart mit Config-Mismatch und Auto-Push
- Abnahme-Kriterium fuer Gesamtintegration:
  - Keine "false normal" Freigabe nach Reconnect,
  - konsistente Zustandsuebergaenge ueber Server, MQTT, Device-Status.

---

## Abgleich mit Akzeptanzkriterien

- [x] State-Machine ist fuer den Gesamtserver konsistent und vollstaendig
- [x] Trigger/Guard/Action ist pro Transition explizit beschrieben
- [x] Restart- und Teilwiederanlaufverhalten ist nachvollziehbar modelliert
- [x] Kritische Uebergangsrisiken sind priorisiert und begruendet
- [x] Ergebnis ist ohne externe Kontextdatei voll verstaendlich

