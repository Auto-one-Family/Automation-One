# Report S13 — Synthese: Integration, Ownership, Go/No-Go, Folgeaufträge

**Datum:** 2026-04-05  
**Bezug Auftrag:** `auftrag-server-S13-synthese-integration-ownership-2026-04-05.md`  
**Code-Wurzel:** `El Servador/god_kaiser_server/`  
**Hinweis:** Keine Codeänderungen im Rahmen dieses Reports.

---

## 0. Inhaltsverzeichnis der Eingaben (Pflicht) und Risiko

| Report (kanonischer Pfad) | Status |
|---------------------------|--------|
| `report-server-S0-bootstrap-lifespan-2026-04-05.md` | **fehlt** |
| `report-server-S1-core-infrastruktur-2026-04-05.md` | **vorhanden** |
| `report-server-S2-api-http-router-services-2026-04-05.md` | **fehlt** |
| `report-server-S3-websocket-realtime-2026-04-05.md` | **fehlt** |
| `report-server-S4-mqtt-transport-routing-publishing-2026-04-05.md` | **fehlt** |
| `report-server-S5-mqtt-handler-vollstaendig-2026-04-05.md` | **fehlt** |
| `report-server-S6-persistenz-session-models-repos-2026-04-05.md` | **fehlt** |
| `report-server-S7-domain-services-aktuator-safety-config-2026-04-05.md` | **fehlt** |
| `report-server-S8-domain-services-logic-scheduler-simulation-2026-04-05.md` | **fehlt** |
| `report-server-S9-runtime-inbox-notifications-2026-04-05.md` | **fehlt** |
| `report-server-S10-e2e-ingestion-2026-04-05.md` | **fehlt** |
| `report-server-S11-e2e-command-actuator-2026-04-05.md` | **fehlt** |
| `report-server-S12-e2e-logic-safety-2026-04-05.md` | **fehlt** |

**Referenzen Oberauftrag:** `analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` ist im Working Tree **nicht mehr vorhanden** (laut Git-Status gelöscht). **G1–G5** werden daher **aus der Querverdrahtung der Serie S0–S12** und dem erhaltenen `implementierungsplan-server-vertragshaertung-und-finalitaet-2026-04-03.md` rekonstruiert (siehe Abschnitt 4).

**Risiko:** Go/No-Go, Gap-IDs und Report-Verweise sind bis zur Lieferung von S0, S2–S12 und Wiederherstellung/Archiv des Oberauftrags **nur bedingt belastbar**. Die folgende Synthese markiert explizit, wo nur **Auftragsdefinition**, **S1**, **Implementierungsplan**, **Firmware-Integrationsbericht** oder **punktueller Code-IST** (Intent-Outcome-Registrierung) herangezogen wurde.

---

## 1. Ownership-Matrix (State / Failure / Konflikt / Testidee)

Legende **Konfliktregel:** wer bei Widerspruch zwischen Schichten „gewinnt“ oder die Auflösung definiert.

| Grenze | State-Owner | Failure-Owner | Konfliktregel | Testidee |
|--------|-------------|---------------|---------------|----------|
| **Firmware ↔ MQTT** | Firmware (lokaler Runtime-State, NVS, Admission) | Firmware (erste Ablehnung/Drop); Server interpretiert Heartbeat/Outcomes | **Server-zentrisch:** Server-Logik und Safety gelten; Firmware führt aus oder lehnt mit Outcome ab. Bei fehlendem Outcome: Incident = Firmware+Integration (siehe FW-P0). | MQTT-Trace: Command mit/ohne `correlation_id`; parallele Config-Intents; Lane-Busy; NVS-Ring voll. |
| **MQTT ↔ Server (Ingestion)** | Server-DB + Domain-Services (persistierter IST-Zustand) | Server-Handler + Resilience (Circuit Breaker); Firmware bei Publish-Fehlern | **Persistenz gewinnt** für Langzeit-IST; **letztes valides Telemetrie-Event** für Echtzeit, sofern nicht anders spezifiziert. | Handler-Tests + Integration: Sensor/Heartbeat unter DB-Fehler (siehe G2). |
| **Server / DB** | PostgreSQL (SSOT für registrierte Geräte, Konfiguration, Historie) | Server (Retry, Breaker, Alerts); DB-Outage = Server-Operations-Thema | **Transaktion / Repository-Contract:** kein „teilweise committed“ ohne klare Semantik; Degraded-Flags über `RuntimeState`/Health. | Chaos: DB pause; erwartete Handler-Fehler vs. Inbox-Replay (Folgeauftrag). |
| **Server ↔ Frontend (HTTP/WS)** | Server (kanonische API-Responses, WS-Payloads) | Server (Auth, Validierung); Client (Reconnect, UI-Fehlerzustände) | **API-Schema gewinnt**; UI darf nur projizieren, nicht raten. | Contract-Tests: WS-Event-Shape; E2E: 401/4001, Reconnect. |
| **Logic / Safety (Server intern)** | `LogicEngine` + Regelzustände (inkl. Hysterese-DB) | `SafetyService` bei Aktoren; `RuntimeState` bei globalem Degraded | **Safety blockt vor Actuator**; Logic kann nicht um Safety herum senden. | Zwei Rules → ein Aktor; Emergency während Rule-Feuer. |
| **Cross-Layer „Intent“** | Soll: eine SSOT pro Intent (laut Implementierungsplan noch auszubauen) | Wer den letzten **terminalen** Outcome liefert (FW) bzw. persistiert (Server) | Bei Widerspruch: **Audit + Korrelation** (`intent_id` / `correlation_id`); ohne Korrelation nur heuristische Reconciliation (Risiko G3). | Reorder zweier Responses; Timeout; spätes ACK. |

---

## 2. E2E-Flow-Katalog (Name → Auftrags-Abschnitt in S10/S11/S12)

Keine Pfad-Duplikation: Verweis nur auf **Aufgabenblöcke** der Querschnittsaufträge (Reports selbst fehlen größtenteils).

| # | Flow-Name | S10 (Ingestion) | S11 (Command/Actuator) | S12 (Logic/Safety) |
|---|-----------|-----------------|-------------------------|---------------------|
| F1 | **Sensor-Rohdaten → Persistenz → Downstream** | §1 Pfadatlas, §2 Mindestabdeckung `sensor` | — | §1 D2 (falls Sensorfehler Rules triggern) |
| F2 | **Heartbeat / LWT → Online-IST + Degraded-Flags** | §1–§2 (`heartbeat`, `lwt`) | — | §3 Recovery (Reconnect-Bezug) |
| F3 | **Diagnostics / Error-Events → Aggregation / UI** | §1–§2 (`diagnostics`/`error`) | — | §1 D2 (Fehlerklassen) |
| F4 | **Config-Antwortpfad (`config_response`)** | §1–§2 `config` response path | §4 Intent-Outcome (Nebenpfad) | — |
| F5 | **Discovery (falls aktiv)** | §1–§2 `discovery` | — | — |
| F6 | **REST/MQTT Command → Publisher → ACK/Response → DB/WS** | — | §1 Zustandsdiagramm, §2 Korrelation, §5–§6 Traces | §1 D2, §2 Interlocks |
| F7 | **Emergency / Broadcast** | — | §3 Emergency | §2 Safety vs. Logic |
| F8 | **Intent-Outcome kanonisch + Lifecycle (CONFIG_PENDING)** | §3 Verlust-/Drift-Matrix (Outcomes als Ausgang) | §4 Intent-Outcome-Verdrahtung | — |
| F9 | **Rule-Evaluation → ActuatorCommand** | — | §6 Störfälle (Timeout/NAK) | §1 D2, §2 Interlocks, §3 Recovery |
| F10 | **Notification / Inbox / Runtime-Orchestrierung** | §5 G2 (stille Enden) | — | §1–§5 (Sichtbarkeit) |

---

## 3. Go/No-Go zu G1–G5 (Oberauftrag-Rekonstruktion)

**Definition G1–G5** (aus Serien-Verweisen + Zielbild `implementierungsplan-server-vertragshaertung-und-finalitaet-2026-04-03.md` abgeglichen):

| ID | Kurzdefinition |
|----|----------------|
| **G1** | Realtime-/Transport-Sichtbarkeit: kritische Zustände über MQTT, WS und API nachvollziehbar. |
| **G2** | Keine stillen Verluste auf kritischen Inbound-Pfaden (inkl. DB-Störung, Backpressure). |
| **G3** | Durchgängige Korrelation (`intent_id`, `correlation_id`) ohne unsicheres FIFO-Raten. |
| **G4** | Explizites Runtime-/Degraded-Modell; kein dauerhaftes „scheinbar OK“. |
| **G5** | Persistenz und Finalität von Commands/Outcomes (terminaler Zustand belegbar). |

| Kriterium | Status | Beleg / Gap-ID | Anmerkung |
|-----------|--------|------------------|-----------|
| **G1** | **teilweise** | S1 (Health irreführend positiv); **Code-IST:** `intent_outcome` + `intent_outcome/lifecycle` in `main.py` registriert; `FIRMWARE_CONTRACT_SERVER_2026-04-05.md` nennt WS/Metriken | Volle Pfadabdeckung aller Ingestion-/Command-Ausgänge **offen** ohne S10/S11. |
| **G2** | **offen** | IMP-P0.3 (durable Inbound); FW-P0: `C1`, `D-lane`, `E1` aus `BERICHT-integrationsluecken-esp32-gesamtsystem-2026-04-05.md` | Serverseitig: S6/S9/S10 fehlen; Firmware: dokumentierte stille Drops. |
| **G3** | **teilweise** | S11-Auftrag §2 (FIFO-Fallback-Risiko); FW `E3`/`G2` (generierte IDs) | Handler und Topic-Parsing für Outcomes existieren (IST); vollständige Korrelationsbeweise **offen** ohne S11. |
| **G4** | **teilweise** | S1-Report: Basic-Health vs. DB-Realität; FW `B1`/`F2` (zwei „Degraded“-Semantiken) | RuntimeState/Heartbeat verbessern Bild, ersetzen aber keine vollständige E2E-Diagnose. |
| **G5** | **offen** | IMP-P0.1 (persistierte Intent/Outcome-Statemachine); IMP-Ausgang „No-Go“ 2026-04-03 | Teilfortschritt möglich (Outcomes werden verarbeitet); **terminale SSOT pro Intent** laut Plan noch nicht als erfüllt dokumentiert. |

**Gesamt-Go/No-Go (Stakeholder):** **No-Go** für „vertraglich finale Semantik“ im Sinne des Implementierungsplans, solange **G2/G5** und die Firmware-**P0**-Lücken offen sind und die Querschnittsreports **S10–S12** fehlen.

---

## 4. Intent-Outcome: Server-E2E vs. Firmware-Härtung

**Server-IST (Stichprobe Code, nicht Voll-Audit):**

- Subscription/Handler: `kaiser/+/esp/+/system/intent_outcome` → `intent_outcome_handler.handle_intent_outcome`; `…/intent_outcome/lifecycle` → `intent_outcome_lifecycle_handler` (`src/main.py` ca. 299–309).
- Dokumentierter Abgleich: `El Servador/god_kaiser_server/docs/FIRMWARE_CONTRACT_SERVER_2026-04-05.md` (Flows, Lifecycle-Topic, Telemetrie, Metriken).

**Kompatibilität:** **Grundsätzlich ja** für die in der Firmware-Changelog-Doku genannten Felder und Topics; **eingeschränkt** solange die Firmware **zwei JSON-Formate** auf einem Topic nutzt (FW `A2`/`G1` im Integrationsbericht) und P0-Stille-Verluste bestehen — der Server kann dann **keine** vollständige Outcome-Garantie ableiten.

### P0-Lücken (gesamtsystem, Intent/Outcome-Fokus)

| ID | Beschreibung | Owner-Vorschlag | Fix-Proof (messbar) |
|----|--------------|-----------------|---------------------|
| **P0-SRV-01** | Fehlende **persistierte** Intent/Outcome-Statemachine + Timeout-/Reconcile-Regeln (IMP P0.1) | Server-Team | 1000 parallele Intents: je genau ein terminaler DB-Zustand; pytest + Lasttest. |
| **P0-SRV-02** | Keine **durable Inbound-Inbox** bei DB-Ausfall für kritische MQTT-Klassen (IMP P0.3) | Server-Team | DB kill: keine stillen Drops in Testmatrix; Replay-Job leert Inbox deterministisch. |
| **P0-FW-01** | NVS `cfg_pending`-Ring: Verdrängung ältester Einträge **ohne** terminales Outcome (FW `C1`) | Firmware-Team | Repro >3 parallele Configs: jeder verworfene Intent sendet Outcome oder expliziten NACK. |
| **P0-FW-02** | Config-Lane busy: Zone/Subzone **still** verworfen (FW `D`) | Firmware-Team | Synthetischer Lane-Busy: `zone/ack`/`subzone/ack` oder Outcome mit Code `CONFIG_LANE_BUSY`. |
| **P0-FW-03** | Kritischer Outcome bei voller NVS-Outbox verworfen (FW `E1`) | Firmware-Team | Outbox-Overflow-Test: Server empfängt Outcome oder Alarm-Telemetrie in Heartbeat. |

---

## 5. Master-Gap-Liste (konsolidiert P0 / P1 / P2)

**P0** — siehe Tabelle oben plus: Abnahme **S10–S12** als Nachweis für Server-Ingestion/Command/Logic-Kreise.

**P1** — Auszug: FW Zone-Parse ohne ACK (`D`); heterogene `intent_outcome`-Payloads (`A2`/`G1`); Health/Detailed-Platzhalter (S1); „Degraded“-Semantik FW Heartbeat vs. Admission (`B1`/`F2`).

**P2** — Auszug: CONFIG_PENDING ohne zusätzliches Pending-Telemetry (`A1`); Drift-Events ohne Server-Correlation (`G2`); fehlende Harness-Tests (FW §H); Roadmap **P2.7** formale Contract-Ownership-Dokumentation bis Paket-2-Abnahme.

---

## 6. Folgeaufträge (nummeriert, umsetzbar, ohne Code in S13)

1. **Serien-Reports nachziehen:** S0, S2–S12 gemäß `README-serie-S0-S13-2026-04-05.md` erstellen und unter `server-analyse/` ablegen; fehlenden Oberauftrag aus Archiv wieder verknüpfen oder in README ersetzen.  
   **Abnahme:** Verzeichnis enthält 13 Dateien; S13 kann auf konkrete Gap-Zitate verweisen.

2. **S10 ausführen:** `report-server-S10-e2e-ingestion-2026-04-05.md` mit Pfadatlas, Verlust-/Drift-Matrix, G2-Liste.  
   **Abnahme:** Jeder S5-Ingestion-Handler erscheint im Atlas oder ist out-of-scope begründet.

3. **S11 ausführen:** Command-Lifecycle, Korrelation/FIFO-Fallstricke, Emergency-Trace (≥5 Ankern), Intent-Outcome-Lückenliste.  
   **Abnahme:** Explizite Antwort auf FIFO-Fallback-Frage mit Codezeilen.

4. **S12 ausführen:** D2-Matrix (Failure-Klassen × Erkennung/Übergang/Persistenz/Sichtbarkeit), Safety-vs-Logic-Regeln, Testlücken.  
   **Abnahme:** Jede Zeile hat Codeanker oder „nicht modelliert“ + Folgeauftrag.

5. **Firmware P0-Remediaton:** `C1`, Config-Lane busy, Outbox overflow (siehe Integrationsbericht §3 + §4).  
   **Abnahme:** MQTT-Captures oder automatisierte Tests pro ID.

6. **Server P0.1/P0.3 (Implementierungsplan):** Statemachine + durable Inbound, inkl. Idempotenz- und Replay-Spezifikation.  
   **Abnahme:** pytest + Lastszenario + Ops-Runbook-Auszug.

7. **Referenz-Sync (siehe §7):** Ein Durchlauf `mqtt-development`/`updatedocs` gegen `MQTT_TOPICS.md`, `WEBSOCKET_EVENTS.md`, `REST_ENDPOINTS.md`.  
   **Abnahme:** Diff-Review mit Checkliste Topic/Event/Route.

8. **Frontend (außerhalb Server-Scope aber G1/G6):** Mapping UI-Sicht ↔ kanonische Outcome-States nach Implementierungsplan Zielbild 6.  
   **Abnahme:** `vue-tsc` + manuelle Review-Matrix in Frontend-Auftrag.

---

## 7. Referenz-Dokumente — Drift-Sammelstatus

| Dokument | Stand dieser Synthese | Hinweis |
|----------|------------------------|---------|
| `.claude/reference/api/MQTT_TOPICS.md` | **Drift wahrscheinlich** | Code enthält `intent_outcome`, `intent_outcome/lifecycle`, erweiterte Parser in `topics.py` — Referenz manuell abgleichen. |
| `.claude/reference/api/WEBSOCKET_EVENTS.md` | **Drift wahrscheinlich** | `FIRMWARE_CONTRACT_SERVER_2026-04-05.md` nennt u. a. `intent_outcome_lifecycle` und erweiterte `esp_health`-Felder. |
| `.claude/reference/api/REST_ENDPOINTS.md` | **Unverändert aus S13-Sicht** | Kein erneuter Vollabgleich durchgeführt; Health-Befunde nur aus S1-Report. |

**Konsolidierung:** Sobald S2/S3 liegen, Drift-Liste mit konkreten Zeilennummern und PR-Checkliste ergänzen.

---

## 8. Abnahme S13 (Selbstcheck)

- Kein „unbekannt“ ohne Folgeauftrag: offene Punkte sind unter §0 (fehlende Reports), §4 (P0-Tabelle) und §6 adressiert.  
- Jede **P0-Lücke** hat Owner-Vorschlag und messbaren Fix-Proof (§4).  
- **P2.7** (Roadmap): Integrationsbild und Ownership werden durch §1 + §2 + §6 abgedeckt; Vollabnahme erst mit vollständiger Report-Serie.

---

*Erstellt im Kontext Server-Synthese; Quellen: Aufträge S10–S12, S0, S1-Report, Implementierungsplan 2026-04-03, Firmware-Integrationsbericht 2026-04-05, FIRMWARE_CONTRACT_SERVER_2026-04-05.md, punktuelle Code-Stichprobe `main.py`.*
