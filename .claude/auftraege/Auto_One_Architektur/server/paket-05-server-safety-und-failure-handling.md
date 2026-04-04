# Paket 05 - Server Safety und Failure-Handling

## 1. Safety-Grundmodell

### 1.1 Zielbild
Der Server arbeitet nach einem **degrade-first, recover-controlled** Modell:

1. **Detection**: Fehler schnell und eindeutig erkennen.
2. **Classification**: Fehlerklasse bestimmen (Infrastruktur, Queue, Worker, Latenz, Partition).
3. **Containment**: Schaden begrenzen (fail-fast, droppen, blockieren, isolieren).
4. **Recovery**: kontrolliert zurueck in Normalbetrieb.
5. **Observability**: Zustand ohne Code-Lesen rekonstruierbar machen.

### 1.2 Safety-Invarianten

- **I1 - Keine unsicheren Aktor-Kommandos**: jeder Aktorpfad muss durch Guard + Safety-Checks.
- **I2 - Kein unendliches Retry-Storming**: Backoff, Circuit Breaker, Queue-Grenzen.
- **I3 - Teilausfall darf nicht zum Komplettausfall werden**: Degraded-Mode statt Hard-Stop.
- **I4 - Recovery ist explizit**: Entry/Exit-Regeln und manuelle Notfall-Controls.
- **I5 - Sichtbarkeit vor Optimismus**: Warnungen/Fehler sind sichtbar, nicht still geschluckt.

### 1.3 Betriebszustaende

- **Normal**: MQTT verbunden, DB verfuegbar, keine kritischen Breaker offen.
- **Degraded**: mindestens ein kritischer Pfad eingeschraenkt (MQTT/DB/Worker/Queue/Latenz).
- **Recovery**: Ursache behoben, kontrollierte Rueckkehr (Breaker HALF_OPEN/CLOSED, Queue drain).

---

## 2. Schutzmechanismus-Katalog

## 2.1 Circuit Breaker

- **MQTT Breaker**
  - **Trigger**: wiederholte Publish-Fehler (Threshold konfigurierbar, Default 5).
  - **Wirkung**: Publish wird geblockt (fail-fast), Nachrichten gehen in Offline-Buffer.
  - **Recovery**: reconnect/reset; automatische bzw. manuelle Ruecksetzung.

- **DB Breaker**
  - **Trigger**: Operational/Interface Errors in DB-Session (Default Threshold 3).
  - **Wirkung**: `resilient_session()` blockiert neue DB-Operationen mit `ServiceUnavailableError`.
  - **Recovery**: OPEN -> HALF_OPEN nach Timeout, bei Erfolg zurueck nach CLOSED.

- **External API Breaker**
  - **Trigger**: fuer externe Abhaengigkeiten vorbereitet und registriert.
  - **Wirkung**: zentrale Governance vorhanden, aber Integrationsabdeckung ist aktuell unvollstaendig.
  - **Recovery**: analog zu MQTT/DB.

## 2.2 Rate Limits

- **Logic RateLimiter (hierarchisch)**
  - **Global**: max executions/s.
  - **Per ESP**: max executions/s pro Geraet.
  - **Per Rule (hourly)**: max executions/hour aus DB-Feld.
  - **Trigger**: Budget verbraucht.
  - **Wirkung**: Rule-Ausfuehrung wird blockiert, Safety-Trigger-Metrik hochgezaehlt.

- **Discovery RateLimiter**
  - **Global**: 10 Discoveries/min.
  - **Per Device**: Cooldown 5 min.
  - **Wirkung**: Discovery wird abgewiesen, verhindert Flood bei fehlerhaften Sendern.

- **WebSocket Send RateLimiter**
  - **Trigger**: >10 Nachrichten/s pro Client.
  - **Wirkung**: Nachrichten fuer den Client werden geskippt (Containment gegen Client-Flood).

## 2.3 Queue-Limits und Backpressure

- **MQTT Offline Buffer**
  - **Limit**: bounded deque (`offline_buffer_max_size`, default 1000).
  - **Overflow-Verhalten**: aelteste Nachricht wird verworfen (Drop-Oldest).
  - **Flush**: batchweise (`offline_buffer_flush_batch_size`), Requeue bei transienten Fehlern.
  - **Containment**: begrenzt RAM-Wachstum bei Broker-Ausfall.

- **Subscriber Worker Pool**
  - **Limit**: `subscriber_max_workers` (default 10).
  - **Wirkung**: Parallelitaet begrenzt.
  - **Risiko**: kein explizites Queue-Limit fuer eingereichte Tasks -> potenzieller Backlog unter Last.

- **MQTTCommandBridge Pending ACKs**
  - **Mechanik**: in-memory pending Futures + FIFO fallback.
  - **Wirkung**: ACK-gesteuerte Serialisierung fuer kritische Commands.
  - **Risiko**: keine harte Obergrenze fuer pending Futures.

## 2.4 Idempotenz-Gates

- **SensorData QoS1 Dedup**
  - UNIQUE-Key auf `(esp_id, gpio, sensor_type, timestamp)`.
  - IntegrityError -> Duplicate wird kontrolliert ignoriert.

- **Notification Dedup**
  - Title-Window-Dedup.
  - Fingerprint-Dedup atomar (`ON CONFLICT DO NOTHING`).
  - Correlation-Dedup inkl. Refire-Schutz.

- **Startup-Idempotenz**
  - Mehrere Startup-Jobs sind explizit idempotent (z.B. Registry/Auto-Registration-Pfade).

## 2.5 Retry-Policies

- **Publisher Retry**
  - Exponential Backoff + optional jitter, max attempts konfigurierbar.
  - Ziel: transientes MQTT-Flattern abfedern.

- **DB Init Retry**
  - Exponentielles Retry bei Startup-DB-Rennen.

- **Email Retry**
  - mehrstufig bis `permanently_failed`.

## 2.6 Guard-Checks vor Dispatch

- **Actuator Guard Chain**
  - SafetyService-Validierung vor jedem Aktor-Command.
  - Checks: Emergency Stop, Online-Status, Value-Range, Enabled-State, Konfig-Gueltigkeit.

- **Logic ConflictManager**
  - Locking je Aktor (inkl. Prioritaet und Safety-Override).
  - Konflikte werden vor Dispatch abgefangen.

- **Offline-Precheck in LogicEngine**
  - Offline-ESP Aktionen werden mit Backoff-Skip abgefangen, bevor der Executor laeuft.

---

## 3. Failure-Matrix (Detection -> Containment -> Recovery)

## 3.1 `MQTT_UNAVAILABLE`

- **Detection**
  - MQTT disconnect callback (`connected=false`), monitor-job meldet disconnect.
  - MQTT breaker failures/rejections steigen.

- **Sofortreaktion**
  - Auto-reconnect mit Exponential Backoff.
  - Publish wird gepuffert (Offline Buffer) oder fail-fast bei Breaker OPEN.
  - System startet trotzdem weiter (degraded startup).

- **Erlaubt im Degraded Mode**
  - DB/REST/Read-Operationen.
  - interne State-Updates, Audit, Health.

- **Verboten/Unsicher**
  - garantiertes Echtzeit-Dispatch zu ESP.
  - harte Zusage auf sofortige Aktorwirkung.

- **Recovery-Kriterien**
  - MQTT verbunden.
  - Breaker `mqtt` in CLOSED.
  - Offline buffer drain ohne erneute Fehler.

- **Risiko Fehlklassifikation**
  - als reines Device-Problem fehlklassifiziert -> Broker-Problem bleibt unentdeckt, Queue waechst.

## 3.2 `DB_UNAVAILABLE`

- **Detection**
  - `OperationalError`/`InterfaceError`.
  - DB breaker oeffnet.
  - Session-Aufrufe liefern `ServiceUnavailableError`.

- **Sofortreaktion**
  - Fail-fast fuer DB-Pfade.
  - Rollback laufender Transaktionen.

- **Erlaubt im Degraded Mode**
  - begrenzte in-memory Pfade ohne Persistenzanspruch.

- **Verboten/Unsicher**
  - persistente Zustandsaenderungen (Aktor-History, Device-Status, Notification-Persistenz).

- **Recovery-Kriterien**
  - DB erreichbar.
  - DB breaker HALF_OPEN->CLOSED mit erfolgreichen Testrequests.

- **Risiko Fehlklassifikation**
  - als App-Bug statt Infrastruktur behandelt -> unnoetige Restarts statt DB-Recovery.

## 3.3 `SERVICE_DEPENDENCY_DOWN`

- **Detection**
  - explizite Fehler in abhaengigen Diensten (z.B. Email, optionale Services, externe API).
  - Retry-Fehler/`permanently_failed`.

- **Sofortreaktion**
  - degradierte Fortsetzung (best-effort), Fehler protokollieren.
  - kritische Kernpfade (MQTT/DB/Safety) bleiben priorisiert.

- **Erlaubt im Degraded Mode**
  - Kernfunktion mit eingeschraenkten Nebenkanal-Features.

- **Verboten/Unsicher**
  - Annahme, dass externe Side-Effects erfolgreich waren.

- **Recovery-Kriterien**
  - Service wieder erreichbar, Retry erfolgreich, Fehlerrate sinkt stabil.

- **Risiko Fehlklassifikation**
  - als Kernfehler behandelt -> unnötig harte Betriebsreduktion.

## 3.4 `QUEUE_OVERFLOW`

- **Detection**
  - Offline buffer utilization hoch, `messages_dropped` > 0.
  - steigende pending counts/Backlog-Indikatoren.

- **Sofortreaktion**
  - Drop-Oldest (expliziter Datenverlust zugunsten Stabilitaet).
  - Batch-flush/requeue-Mechanik aktiv.

- **Erlaubt im Degraded Mode**
  - neue kritische Kommandos (nur falls Priorisierung vorhanden) begrenzt weiter.

- **Verboten/Unsicher**
  - ungebremstes Nachschieben ohne Backpressure.

- **Recovery-Kriterien**
  - Queue unter Schwellwert, kein neues Dropping, Flush stabil.

- **Risiko Fehlklassifikation**
  - als rein transient eingestuft obwohl dauerhaft -> schleichender Datenverlust.

## 3.5 `WORKER_STALL`

- **Detection**
  - MQTT Handler timeout (30s) im Subscriber.
  - wachsende Fehlerrate/ausbleibende Verarbeitung.

- **Sofortreaktion**
  - betroffene Message als failed markieren.
  - restliche Verarbeitung bleibt isoliert weiter aktiv.

- **Erlaubt im Degraded Mode**
  - andere Handler/Worker laufen weiter.

- **Verboten/Unsicher**
  - Vertrauen auf Reihenfolge/Timeliness fuer gestallte Tasks.

- **Recovery-Kriterien**
  - keine neuen Timeout-Events.
  - normalisierte Durchsatz-/Fehlerraten.

- **Risiko Fehlklassifikation**
  - als MQTT-Ausfall fehlklassifiziert -> falsche Eskalation, echte Handler-Blockade bleibt.

## 3.6 `HIGH_LATENCY`

- **Detection**
  - DB Query Duration Histogram steigt.
  - erhoehte ACK-Wartezeiten/Timeouts.
  - steigende Retry-Wellen.

- **Sofortreaktion**
  - Retry/Backoff statt aggressiver Wiederholung.
  - Rate-Limits und Queue-Grenzen verhindern Kettenreaktion.

- **Erlaubt im Degraded Mode**
  - reduzierte Last, priorisierte Safety-Kernpfade.

- **Verboten/Unsicher**
  - burstige Massenausfuehrung trotz erkennbarer Ueberlast.

- **Recovery-Kriterien**
  - Latenzen dauerhaft unter Schwellwert.
  - Timeouts normalisieren sich.

- **Risiko Fehlklassifikation**
  - als Hard-Down behandelt -> unnoetige Abschaltung.

## 3.7 `PARTIAL_PARTITION`

- **Detection**
  - einzelne ESPs offline (LWT instant oder Heartbeat timeout), restliches System gesund.
  - reconnect-induzierte State-Push/Resync-Pfade aktiv.

- **Sofortreaktion**
  - betroffene Devices auf offline.
  - Aktor-States fuer betroffene Devices auf sicheren Zustand (`off`) setzen.
  - gezielte Resyncs bei Reconnect (Zone/Subzone/config push).

- **Erlaubt im Degraded Mode**
  - Operation fuer verbleibende gesunde Segmente.

- **Verboten/Unsicher**
  - blindes Ausrollen auf partitionierte Geraete ohne ACK.

- **Recovery-Kriterien**
  - Heartbeat/LWT stabil.
  - Reconnect + Full-State-Push + ACK abgeschlossen.

- **Risiko Fehlklassifikation**
  - als Full-Outage behandelt -> unnötiger Systemstillstand.

---

## 4. Degraded-Mode-Regelwerk

## 4.1 Eintrittsbedingungen

Degraded-Mode gilt als aktiv, wenn mind. eine Bedingung zutrifft:

- MQTT disconnected oder MQTT breaker OPEN.
- DB breaker OPEN oder DB Session-Fehler in Serie.
- Queue-Druck kritisch (Offline buffer nahe voll, Dropping aktiv).
- Worker-Stalls/Handler-Timeouts ueber Schwellwert.
- Heartbeat/LWT zeigt partielle Partition.

## 4.2 Betriebsgrenzen

- **Aktorpfad**
  - nur ueber Guard-Chain.
  - keine stillen Erfolgsannahmen bei unsicherem Dispatch.

- **Persistenzpfad**
  - bei DB-Problemen fail-fast; keine "half-commits".

- **Kommunikationspfad**
  - MQTT-Ausfall -> buffering innerhalb harter Grenze, danach Drop-Policy.

- **Steuerpfad**
  - Logic-Ausfuehrung unter Rate-Limit + Conflict-Management.

## 4.3 Exit-Bedingungen

Degraded-Mode darf verlassen werden, wenn:

1. kritische Breaker wieder CLOSED sind,
2. Kernabhaengigkeiten stabil erreichbar sind (MQTT/DB),
3. Queue-Backlog abgebaut ist,
4. keine neuen Stall-/Timeout-Spitzen auftreten,
5. Reconnect-Resync fuer partitionierte Devices abgeschlossen ist.

## 4.4 Sichere Aktorpfade im Degraded Mode

- **Sicher moeglich**
  - lokale Blockierung unsicherer Kommandos (SafetyService).
  - Konfliktvermeidung (ConflictManager).
  - automatische Ruecksetzung bei Device-Offline (LWT/Heartbeat timeout).

- **Nicht sicher zugesichert**
  - sofortige physische Wirkung bei MQTT-Ausfall.
  - garantierte Reihenfolge bei Queue-Druck ohne Priorisierung.

## 4.5 Fail-Open vs Fail-Closed Entscheidungen

- **Fail-Closed**
  - DB breaker blockiert DB-Operationen.
  - SafetyService blockiert ungueltige/offline/notaus-kritische Aktorcommands.
  - Rule-Execution bei Rate-Limit/Conflict wird gestoppt.

- **Fail-Open (kontrolliert)**
  - Server startet trotz initialem MQTT-Ausfall (Availability priorisiert).
  - manche Nebenfunktionen laufen best-effort weiter (z.B. WS-Broadcast-Fehler blockiert Pipeline nicht).
  - RateLimiter hourly-check: bei DB-Fehler derzeit fail-open (Verfuegbarkeit > Strenge).

**Begruendung**: Safety-kritische Entscheidungen sind fail-closed. Nicht-safety-kritische Nebenpfade sind fail-open, um Gesamtbetrieb stabil zu halten.

---

## 5. Observability-Anforderungen

## 5.1 Pflicht pro kritischem Failure-Path

- **Logs**
  - strukturierte Ereignisse fuer Detection, Containment, Recovery.
  - klare Marker: breaker transitions, queue drops, timeout, reconnect, resync.

- **Metriken**
  - MQTT connected, publish/receive errors.
  - offline buffer size + dropped/flushed.
  - DB query duration histogram.
  - safety triggers, logic errors, actuator timeouts.
  - ws disconnects.

- **Alerts**
  - MQTT disconnected > X min.
  - Breaker OPEN > Y min.
  - Offline buffer utilization > 80/90% oder drops > 0.
  - DB latency p95 ueber Schwellwert.
  - worker timeout/event-loop errors in Spike.

- **Korrelation**
  - Request-ID middleware (`X-Request-ID`) fuer HTTP.
  - MQTT correlation_id-Propagation in Handler/Dispatch/Audit.
  - einheitliche Incident-ID im Betrieb (runbook-seitig) fuer cross-layer Diagnosen.

## 5.2 Incident-Diagnose ohne Code-Lesen

Minimaler Diagnosepfad:

1. Health APIs:
   - `/health`, `/api/v1/health/`, `/api/v1/health/detailed`, `/api/v1/health/ready`.
2. Resilience APIs:
   - `/api/v1/debug/resilience/status`
   - `/api/v1/debug/resilience/metrics`
   - `/api/v1/debug/resilience/offline-buffer`
3. Operational controls:
   - targeted breaker reset / reset-all (nur nach Ursachenbehebung).
   - offline buffer flush/clear fuer kontrollierte Recovery.
4. Metrik-Dashboard:
   - queue pressure, breaker states, latency, error rates, safety triggers.
5. Audit/Logs:
   - LWT/heartbeat timeout, actuator resets, config push/reconnect flows.

---

## 6. Safety-Luecken und Top-Risiken

## 6.1 Kritische Luecken

1. **Unbounded Backlog-Risiko im Subscriber**
   - Worker-Anzahl ist begrenzt, aber keine harte Queue-Grenze fuer eingereichte Tasks.
   - Risiko: RAM-Druck bei Ingress-Spitzen.

2. **Unbounded Pending-Risiko in MQTTCommandBridge**
   - pending Futures/Index ohne harte Obergrenze.
   - Risiko: Speicherdruck bei ACK-Ausfaellen.

3. **Timeout-Framework nur teilweise verankert**
   - Resilience timeout primitives vorhanden, aber nicht konsistent als harte Schutzschicht angewendet.
   - Risiko: inkonsistente Latenz-Abwehr je Pfad.

4. **Hourly Rate-Limit check fail-open bei DB-Fehler**
   - bewusst verfuegbarkeitsorientiert, kann aber bei DB-Problemen Rule-Storming beguenstigen.

5. **Health `detailed` teilweise mit Platzhalterwerten**
   - einige Felder (z.B. DB latency/pool) sind nicht runtime-echt gemessen.
   - Risiko: Incident-Einschaetzung falsch positiv/negativ.

## 6.2 Top-Risiken (priorisiert)

- **R1** Queue-/Backlog-Explosion bei kombinierten MQTT-Problemen + Worker-Stall.
- **R2** Silent Data Loss bei laengerem Buffer-Overflow (Drop-Oldest ohne harte Alerting-Schwelle).
- **R3** Recovery ohne klare Gate-Kriterien kann flap verursachen.
- **R4** Teilweise fehlende harte Timeouts in kritischen Handlern.

---

## 7. Hand-off in P2.6/P2.7 und Paket 5 Gesamtintegration

## 7.1 Hand-off nach P2.6 (Observability/Operations)

P2.6 soll auf dieser Datei aufbauen und konkret liefern:

- verbindliche Alert-Schwellen pro Failure-Klasse,
- Dashboard-Panel-Mapping (Detection/Containment/Recovery),
- Incident-Runbooks je Klasse (`MQTT_UNAVAILABLE`, `DB_UNAVAILABLE`, ...),
- Recovery-Gates als Checklisten.

## 7.2 Hand-off nach P2.7 (Hardening/Validierung)

P2.7 soll absichern:

- Chaos/Failure-Tests fuer alle 7 Klassen,
- Lasttest fuer Queue-/Backpressure-Limits,
- Nachweis, dass Fail-Closed-Entscheidungen im Aktorpfad immer greifen,
- Regressionsschutz fuer Reconnect/Partition-Recovery.

## 7.3 Paket-5 Gesamtintegration

Dieses Dokument ist die Safety- und Failure-Referenz fuer Paket 5:

- verbindet Architektur mit Betriebsregeln,
- definiert Failure-Klassen als gemeinsame Sprache fuer Dev/Ops,
- stellt sicher, dass Degraded-Betrieb kontrolliert und beobachtbar bleibt,
- schafft die Grundlage fuer P2.6 (Operations) und P2.7 (Verifikation).

