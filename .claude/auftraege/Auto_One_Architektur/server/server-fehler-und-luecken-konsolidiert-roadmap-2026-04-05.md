# Server-Analyse S0–S13: Fehler, Lücken und Drift — konsolidierte Roadmap

**Stand:** 2026-04-05  
**Quelle:** Reports im Ordner `…/Auto_One_Architektur/server/` (`report-server-S0` … `S13`), plus `implementierungsplan-server-vertragshaertung-und-finalitaet-2026-04-03.md`.  
**Zweck:** Ein Dokument zum **themenweisen** Abarbeiten (nicht Report-für-Report). Gleiche Befunde sind **zusammengezogen**.

---

## Meta (Artefakte)

| Befund | Kurz |
|--------|------|
| **S13 Abschnitt 0** listet viele Reports als „fehlend“ unter `server-analyse/` — die **kanonischen Lieferungen** liegen parallel **in diesem Auftragsordner**; S13 bei Bedarf aktualisieren oder Reports nach `.claude/reports/current/server-analyse/` spiegeln. |
| **`analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md`** wird mehrfach als gelöscht/fehlend genannt — für G1–G5-Traceability ggf. aus Archiv wieder verknüpfen. |
| **`implementierungsplan` P0.2** behauptet u. a., `intent_outcome` sei nicht registriert — **IST laut S5/S11:** Handler + Subscription in `main.py` vorhanden. P0.2 als „E2E kanonisch + API/WS/Audit vollständig“ lesen, nicht als „Routing fehlt“. |

---

## Themencluster zum sequenziellen Abarbeiten

Reihenfolge orientiert an Risiko und Abhängigkeit (Vertrag → Transport → Domain → Doku).

---

### A. Bootstrap, Shutdown, globale Verdrahtung (S0)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **A1** | P1 | **Startup-Exception vor `yield`:** kein umschließendes `finally` in `lifespan` — bei teilweise initiiertem MQTT/DB droht **fehlendes symmetrisches Cleanup**. |
| **A2** | P2 | **`ESPRepository`-Nutzung in `main.py`:** implizite Import-Reihenfolge im Block — **lesbarkeit/fragil**, kein Top-Level-Import. |

---

### B. Health, Readiness, „scheinbar OK“ (S1, S9, Kreuz S12)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **B1** | P0 | **`GET /health` / Basis-`GET /api/v1/health/`:** prüfen **nur MQTT**, nicht DB, nicht `ready`/Logic — **Loadbalancer kann „healthy“ melden** bei DB-Pool/Totalschaden. |
| **B2** | P0 | **`/detailed` → `DatabaseHealth`:** `connected=True` + **Platzhalter** (`pool_available`, `latency_ms`) — **Monitoring-Drift**, suggeriert echte DB-Gesundheit. |
| **B3** | P1 | **`/ready`:** `database: true` **ohne** expliziten Ping — nur indirekt über Session-Dependency. |
| **B4** | P1 | **`set_degraded_reason`:** praktisch nur `mqtt_disconnected` — **DB-Ausfall spiegelt sich nicht** in Runtime-`degraded_reason_codes` (S9). |
| **B5** | P2 | **`health.py`-Docstring** erwähnt `/metrics` — Instrumentator unter **`/api/v1/health/metrics`** (S1). |

---

### C. HTTP-API, Auth, Nebenkanäle (S2, Ergänzung S7)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **C1** | P0 | **`REST_ENDPOINTS.md` ↔ Code:** falsche/fehlende Pfade (z. B. `mqtt-credentials` vs `mqtt/configure`, fehlende API-Keys, veraltete Sensor-/Actuator-URLs) — **Integrations-/Frontend-Risiko**. |
| **C2** | P0 | **Finalität:** Actuator-Command, Zone/Subzone-MQTT — **HTTP-200 ≠ Geräte-Finalität**; Doku/Contract muss **ACK-Lifecycle (MQTT)** explizit koppeln. |
| **C3** | P1 | **Zwei Router unter `/api/v1/sensors`:** `v1/sensors.py` vs `sensor_processing.py` — **unterschiedliche Auth** (JWT vs API-Key); architektonisch klar trennen und dokumentieren. |
| **C4** | P2 | **Nebenkanal-Fehler:** MQTT-Publish-Fail oft nur Log — Runbooks/Symptom „DB ok, Gerät nicht aktualisiert“. |
| **C5** | P1 | **`toggle_rule` (Logic API):** Regel OFF + **`send_command` schlägt fehl** → Response kann **`success=True`** trotzdem liefern (nur Warning) — **API täuscht Erfolg** (S7). |

---

### D. WebSocket / Realtime (S3)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **D1** | P1 | **`WEBSOCKET_EVENTS.md`:** fehlen u. a. **`intent_outcome_lifecycle`**, **`actuator_config_deleted`**; Handler-Tabelle §14 unvollständig. |
| **D2** | P1 | **`system_event`:** Doku vs Code — Code im Wesentlichen **`mqtt_disconnected`**; Doku evtl. Cleanup-Beispiele — **angleichen**. |
| **D3** | P2 | **Payload-Drift:** `device_approved` / `device_rejected` / `events_restored` / `sequence_step` / `notification_unread_count` / VPD-`sensor_data`-Variante — **Felder dokumentieren oder API vereinheitlichen**. |
| **D4** | P2 | **Legacy `notification`:** nicht mehr als Typ `notification` gebroadcastet — Doku an **NotificationRouter-Pfad** anpassen. |
| **D5** | P1 | **Kein REST-ähnliches WS-Fehlerprotokoll** — nur Close-Codes (z. B. 4001); optional kleines JSON vor `close` (S1/S3). |
| **D6** | P2 | **Rate-Limit 10/s, stilles Drop** — kein Replay-Buffer; bewusstes Design, für Betrieb/UI dokumentieren. |

---

### E. MQTT Transport, Subscriptions, Publishing (S4, S5)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **E1** | P0 | **`sensor/batch`:** laut `MQTT_TOPICS.md` dokumentiert — **kein** `register_handler`, **kein** Handler — Batch-Ingestion **fehlt** (S4/S5). |
| **E2** | P1 | **`pi_enhanced/response` vs. tatsächlicher Publish `…/sensor/{gpio}/processed`:** Constants/Doku vs `TopicBuilder` — **Drift**. |
| **E3** | P1 | **Constants ohne Subscription in `main.py`:** u. a. `…/health/status`, **`pi_enhanced/request`**, **`subzone/status`** — entweder **subscriben** oder Doku als „nicht genutzt“ markieren. |
| **E4** | P2 | **Global Emergency:** Doku oft QoS **2**, Code **`qos=1`** (S4). |
| **E5** | P2 | **`TopicBuilder.parse_topic`:** fehlt Eintrag für **Diagnostics-Parser** trotz vorhandenem Parser (S4/S5). |
| **E6** | G2 | **Kein Handler-Match:** nur WARNING; **kein Dead-Letter-Topic**. |
| **E7** | G2 | **Offline-Buffer voll** / **Flush nach 3 Fehlversuchen** / **Publisher-Retry erschöpft** — Drop + Log, **keine persistente Outbox** auf dieser Schicht (S4). |
| **E8** | P2 | **`Publisher._publish_with_retry` nutzt `time.sleep`** — **blockiert HTTP-Worker** (S4). |

---

### F. MQTT-Handler, Ingestion, Korrelation (S5, S10, S9)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **F1** | P0 | **Heartbeat Subscribe-QoS 0** — höheres **Drop-Risiko** für Liveness/Register vs. andere Telemetry (S10). |
| **F2** | P1 | **Nicht-kritische Topics ohne Inbound-Inbox** — bei Crash/Timeout **kein serverseitiger Replay**; **QoS-1-PUBACK** kann vor DB-Commit fertig sein (S9/S10). |
| **F3** | P1 | **`generate_mqtt_correlation_id` ohne `seq`:** Suffix `no-seq` — **Kollisions-/Trace-Risiko** bei Burst (S5). |
| **F4** | P1 | **Intent-Outcome ohne `correlation_id`:** synthetisch — **Trace-Lücke** bis manuelle Zuordnung (S5). |
| **F5** | P1 | **Sensor-Reorder** (ThreadPool): **letzter Write wins** kann Logic kurz **invertieren** trotz Frische-Gate (S10). |
| **F6** | P1 | **Sensor-Duplikat:** `return True` ohne neuer DB-Row/WS — **stilles Ende** für Downstream ohne DB (S10). |
| **F7** | P2 | **Discovery ohne WS** — UI erst nach Heartbeat sichtbar (S5). |
| **F8** | P2 | **Viele G2-„stille Enden“** (leerer Payload, bad JSON, stale_drop, mock `None`, Inbox-Append-Fail, Handler-Timeout) — Liste S10 §6 als **Betriebs-Checkliste** nutzen. |

---

### G. Persistenz, Session, Inbox-Datei (S6, S0, S9)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **G1** | P1 | **`init_db` / `create_all`:** importiert nur **Teilmenge** der Modelle — **Tabellen können gegenüber Alembic/vollständigem Modell fehlen** (Dev/CI-Risiko). |
| **G2** | P1 | **Inbound-Inbox Kapazität 20k:** bei Overflow **Drop ältester Events** (inkl. ggf. pending) — **G2 unter Last** (S0/S6). |
| **G3** | P2 | **`library_repo.py`:** Stub trotz Modell `library_metadata`. |
| **G4** | P2 | **HTTP ohne `resilient_session`:** anderes CB-Verhalten als MQTT-Pfad — dokumentieren. |
| **G5** | P2 | **API-Exception → Audit:** `_log_to_audit` kann **still fehlschlagen** (by design). |
| **G6** | P1 | **Inbox auf Temp-Pfad:** Container ohne persistentes `/tmp` → **„durable“ verloren** (S9). |

---

### H. Domain Batch 1 — Aktor, Safety, Config (S7)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **H1** | P2 | **`ActuatorCommandResponse.safety_warnings`:** REST immer `[]` obwohl Safety **Warnungen** liefern kann. |
| **H2** | P2 | **Keine `correlation_id` in REST-Response** — Client-Matching zu `actuator_response` erschwert (mit S11 zusammenarbeiten). |
| **H3** | P2 | **Zwei Emergency-Konzepte:** `SafetyService` vs Simulation `emergency_stopped` — **dokumentieren/vereinheitlichen**. |
| **H4** | P1 | **Adoption:** `is_adoption_completed` **True ohne Zyklus** — Modell für Einsteiger **explizit** dokumentieren (Edge Fresh device vs Reconnect). |

---

### I. Logic, Scheduler, Simulation (S8) + Kreuz S12

| ID | Schwere | Inhalt |
|----|---------|--------|
| **I1** | P0 | **Priorität:** OpenAPI/Pydantic **`1=lowest, 100=highest`** widerspricht Runtime (**kleinere Zahl = höhere Priorität** in Repo/ConflictManager). |
| **I2** | P1 | **`logic_execution_history.success`:** bedeutet eher **„Pipeline ohne Exception“**, nicht **„alle Aktoren hardware-bestätigt“** — mit ActionResults aggregieren oder zweites Feld (S8/S12). |
| **I3** | P1 | **POST neue Regel:** ruft **`on_rule_updated` nicht** auf — Re-Eval/Hysterese vs PUT **inkonsistent**. |
| **I4** | P2 | **Toggle enable:** teils **ohne** `LogicEngine.on_rule_updated`. |
| **I5** | P2 | **`_evaluation_loop`:** praktisch Stub (nur Sleep) — Doku/Kommentar klären. |
| **I6** | P2 | **LogicScheduler:** erster Tick **nach vollem Intervall** — Test/UX-Falle. |
| **I7** | P1 | **Subzone-Skip:** `ActionResult(success=True, skipped)` — für Alarmierung wie Erfolg lesbar (S8/S12). |

---

### J. Runtime, Inbox-Orchestrierung, Notifications (S9)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **J1** | P1 | **`RECOVERY_SYNC` vs laufender Replay:** Modus nicht dauerhaft; **`recovery_completed`** aussagekräftiger als `mode` — Ops-Doku. |
| **J2** | P2 | **`notification_router`:** Kommentar „Optional webhook“ vs `route()` — **aufräumen oder implementieren**. |

---

### K. Command / Actuator E2E, Korrelation (S11)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **K1** | P0 | **`MQTTCommandBridge.resolve_ack`:** **FIFO-Fallback** wenn `correlation_id` fehlt/falsch — **Race → falscher API-Caller** (Zone/Subzone). |
| **K2** | P1 | **REST ohne `correlation_id`; `acknowledged` immer false** — schwache E2E-Observability. |
| **K3** | P1 | **Emergency GPIO-Publishes ohne MQTT-`correlation_id`** — schwache Verknüpfung zu ESP-Response/Incident. |
| **K4** | P2 | **Actuator-Response:** fehlende ESP-`correlation_id` → synthetische IDs von **`ts`** — Kollision bei Parallelität möglich. |

---

### L. Logic & Safety E2E, Recovery (S12)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **L1** | P0 | **`RuntimeMode` (DEGRADED/RECOVERY)** **koppelt nicht** an Logic/Actuator — Logic kann bei **MQTT-down Startup** laufen; **Produktentscheidung:** absichtlich nur Observability **oder** Gates einbauen. |
| **L2** | P1 | **`log_execution(success=True)`** trotz **fehlgeschlagener** `send_command`-Aufrufe — Audit/Monitoring irreführend (Überschneidung **I2**). |
| **L3** | P1 | **Recovery:** LogicEngine/Scheduler starten **vor** Replay; **kein Recovery-Gate** — Rules können **während** `RECOVERY_SYNC`/Replay feuern. |
| **L4** | P2 | **Konflikt-Pfad (ConflictManager):** begrenzte WS-Sichtbarkeit vs Safety-Failures — vereinheitlichen/dokumentieren. |
| **L5** | P2 | **Tests:** kein isolierter Proof „RECOVERY_SYNC + parallele Rule“; Runtime×Logic-Tests fehlen (S12 §5). |

---

### M. Implementierungsplan vs Ist (Querschnitt, S13)

| ID | Schwere | Inhalt |
|----|---------|--------|
| **M1** | P0 | **P0.1 Persistierte terminale Intent/Outcome-Statemachine** inkl. Timeout-/Reconcile-/OOO-Regeln — **No-Go-Kern** laut Plan; Teile existieren (`command_intents`/`outcomes`), **Semantik/Abnahme** offen. |
| **M2** | P0 | **P0.3 „Durable Inbound bei DB-Ausfall“** — File-Inbox existiert für **kritische** Klassen; Plan fordert **keine stillen Drops** + klare **Idempotenz/Drain** — mit **G2/G6/E7** zusammenführen. |
| **M3** | P0 | **P0.4 Emergency atomar** (Safety synchron) — mit Emergency-Pfad S11 abgleichen. |
| **M4** | — | **G1–G5 Gesamt:** laut S13-Synthese **No-Go** für „vertraglich final“ bis G2/G5 + Firmware-P0 geschlossen; nachliefern wenn Oberauftrag wieder verfügbar. |

---

### N. Referenz-Sync (Sammelauftrag aus S2/S3/S4/S13)

**Ein Durchlauf** gegen:

- `.claude/reference/api/REST_ENDPOINTS.md`
- `.claude/reference/api/WEBSOCKET_EVENTS.md`
- `.claude/reference/api/MQTT_TOPICS.md`

plus Abgleich **`health.py`**, **`schemas/logic.py` (Priorität)**, Metrics-Pfad in Doku.

---

## Empfohlene Abarbeitungsreihenfolge (Epics)

1. **Epic 1 — Vertrag & Korrelation:** **K1**, **I1**, **M1** (Teil: Korrelation/Terminalität), **C2**, **H2/K2/K3**.  
2. **Epic 2 — Betrieb echt „grün“:** **B1–B3**, **L1/L3** (Entscheidung Gates vs Doku), **G6**, **G2**.  
3. **Epic 3 — MQTT Vollständigkeit & Verluste:** **E1**, **F1/F2**, **M2** (Spec + Tests), **E3**, **E2**.  
4. **Epic 4 — API-Wahrheit & Logic:** **C5**, **I2/I7**, **I3**, **C1**.  
5. **Epic 5 — Doku/Frontend-Kontrakte:** **N**, **D1–D4**, **C3**.  
6. **Epic 6 — Hygiene P2:** **A2**, **E4–E8**, **F7/F8**, **H1/H3**, **J2**, Tests aus **L5**.

---

## Abnahme pro Epic (minimal)

- Messbare Metriken/Logs für Drops, Replay, Korrelation.  
- pytest: Zone/Subzone parallel ohne FIFO-Fehlzuordnung; DB-down + kritische Topics ohne stillen Verlust (laut Spez).  
- Doku: REST/WS/MQTT einmalig mit Code diff-abgeschlossen.

---

*Ende Konsolidierung. Bei neuen Reports nur die Tabellen in den passenden Cluster einordnen — keine zweite Parallel-Liste pflegen.*
