# Report S10 — Querschnitt Ingestion End-to-End (Bereich A)

**Datum:** 2026-04-05  
**Code-Wurzel:** `El Servador/god_kaiser_server/src/` (horizontal: `mqtt/subscriber.py`, `mqtt/handlers/*`, `main.py`, ergänzend `api/v1/*`)  
**Bezug Auftrag:** `auftrag-server-S10-crosscut-ingestion-e2e-2026-04-05.md`

---

## 0. Blocker / Eingaben

| Eingabe | Status |
|---------|--------|
| Report **S5** (`report-server-S5-mqtt-handler-2026-04-05.md`) | **Fehlt** unter `.claude/reports/current/server-analyse/` — Master-Subscription-Tabelle hier aus **Code** (`main.py` + `subscriber.subscribe_all`) rekonstruiert. |
| Report **S6** (Persistenz) | **Fehlt** im gleichen Ordner — Tabellen aus Handler-/Repo-Pfaden abgeleitet. |
| Report **S9** (Runtime Inbox) | **Fehlt** — Critical-Inbox-Verhalten aus `subscriber.py` (`_is_critical_topic`, `InboundInboxService`). |

**Referenz Oberauftrag:** `analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` liegt im Git-Status als gelöscht markiert; **Bereich A1–A3** wird für diesen Report als „Ingestion-Integrität / Verluste / Korrelation“ interpretiert (siehe Abschnitt 5).

---

## 1. Master-Subscription-Tabelle (S5-Rekonstruktion aus Code)

Registrierung: `src/main.py` (ca. 254–388).  
QoS: `src/mqtt/subscriber.py` → `subscribe_all()` (Heartbeat → 0, `config_response`/`config/ack` → 2, sonst 1).

| Pattern | QoS | Handler-Entry | Datei:Zeile (Registrierung) |
|---------|-----|---------------|----------------------------|
| `kaiser/+/esp/+/sensor/+/data` | 1 | `sensor_handler.handle_sensor_data` | `main.py` ~254–256 |
| `kaiser/+/esp/+/actuator/+/status` | 1 | `actuator_handler.handle_actuator_status` | `main.py` ~257–259 |
| `kaiser/+/esp/+/actuator/+/response` | 1 | `actuator_response_handler.handle_actuator_response` | `main.py` ~261–263 |
| `kaiser/+/esp/+/actuator/+/alert` | 1 | `actuator_alert_handler.handle_actuator_alert` | `main.py` ~265–267 |
| `kaiser/+/esp/+/system/heartbeat` | 0 | `heartbeat_handler.handle_heartbeat` | `main.py` ~268–270 |
| `kaiser/+/discovery/esp32_nodes` | 1 | `discovery_handler.handle_discovery` | `main.py` ~271–273 |
| `kaiser/+/esp/+/config_response` | 2 | `config_handler.handle_config_ack` | `main.py` ~274–276 |
| `kaiser/+/esp/+/zone/ack` | 1 | `zone_ack_handler.handle_zone_ack` | `main.py` ~278–280 |
| `kaiser/+/esp/+/subzone/ack` | 1 | `subzone_ack_handler.handle_subzone_ack` | `main.py` ~282–284 |
| `kaiser/+/esp/+/system/will` | 1 | `lwt_handler.handle_lwt` | `main.py` ~290 |
| `kaiser/+/esp/+/system/error` | 1 | `error_handler.handle_error_event` | `main.py` ~295–297 |
| `kaiser/+/esp/+/system/intent_outcome` | 1 | `intent_outcome_handler.handle_intent_outcome` | `main.py` ~299–302 |
| `kaiser/+/esp/+/system/intent_outcome/lifecycle` | 1 | `intent_outcome_lifecycle_handler.handle_intent_outcome_lifecycle` | `main.py` ~304–307 |
| `kaiser/+/esp/+/system/diagnostics` | 1 | `diagnostics_handler.handle_diagnostics` | `main.py` ~314–316 |
| `kaiser/+/esp/+/actuator/+/command` | 1 | `mock_actuator_command_handler` (Closure) | `main.py` ~378–380 |
| `kaiser/+/esp/+/actuator/emergency` | 1 | `mock_actuator_command_handler` | `main.py` ~382–384 |
| `kaiser/broadcast/emergency` | 1 | `mock_actuator_command_handler` | `main.py` ~386–388 |

**Hinweis:** Kommentar in `main.py` zu LWT nennt brokerseitiges QoS; effektive Subscribe-QoS kommt aus `subscribe_all()` (hier **1**, da kein `heartbeat`/`config_response` im Pattern).

---

## 2. Pfadatlas (Quelle → Handler → Service/Logik → Persistenz → Ausgänge)

Eine Zeile pro wesentlicher Quelle; „Familien“ laut Auftrag mit **fett** markiert.

| Quelle (Topic / Route) | Handler / Endpoint | Service / Kernlogik | Repo / Tabellen (typisch) | Ausgänge (MQTT / WS / HTTP) |
|------------------------|-------------------|---------------------|---------------------------|-----------------------------|
| **`kaiser/+/esp/+/sensor/+/data`** | `SensorDataHandler` (`sensor_handler.handle_sensor_data`) | Pi-Enhanced / Plausibilität, Frische-Gates, Threshold-Pipeline | `sensor_data`, `sensor_configs` (Metadaten/Status), `esps` (last_seen throttled), ggf. VPD-Zeile | WS `sensor_data`; optional MQTT (Pi-Enhanced über `Publisher`); LogicEngine `evaluate_sensor_data` (wenn nicht „stale-for-logic“) |
| **`kaiser/+/esp/+/system/heartbeat`** | `HeartbeatHandler` | Canonical Heartbeat, Auto-Register, ACK/State-Push, Adoption | `esps`, `esp_heartbeat` (über `ESPHeartbeatRepository`), Audit je nach Pfad | MQTT Heartbeat-ACK / Config-Push (über Handler); WS (Health-Events über Serialisierung) |
| **`kaiser/+/esp/+/system/diagnostics`** | `DiagnosticsHandler` | `canonicalize_diagnostics`, Validierung | `esps.device_metadata` (JSON `diagnostics` subtree) | WS `esp_diagnostics` |
| **`kaiser/+/esp/+/system/error`** | `ErrorEventHandler` | Mapping / Canonical Error | `audit_logs` | WS (über `serialize_error_event` / Manager) |
| **`kaiser/+/esp/+/config_response`** | `ConfigHandler` | `canonicalize_config_response`, Status/Failures | `audit_logs`; Updates `sensor_configs` / `actuator_configs` / `command_contracts` je nach Payload | WS Config-Response-Event; ggf. weitere interne Effekte |
| **`kaiser/+/discovery/esp32_nodes`** (**discovery**, legacy) | `DiscoveryHandler` | Validierung, Register/Update | `esps` | Kein Pflicht-MQTT-Back; primär DB + Logs |
| **`kaiser/+/esp/+/system/will`** (**lwt**) | `LWTHandler` | Offline, Terminal-Authority, Adoption reset | `esps` (status), `command_contracts` (terminal authority), `actuator_configs`/History (Reset + `log_command`) | WS (Health/Offline) |
| `kaiser/+/esp/+/actuator/+/status` | `ActuatorStatusHandler` | Status normalisieren, State-Adoption | `actuator_configs` / State-History | WS je nach Implementierung |
| `kaiser/+/esp/+/actuator/+/response` | `ActuatorResponseHandler` | Befehlsbestätigung | Command-/History-Pfade (Repo) | WS / interne Bridges |
| `kaiser/+/esp/+/actuator/+/alert` | `ActuatorAlertHandler` | Alerts | Audit / Notifications-Pipeline (je nach Codepfad) | WS / Notifications |
| `kaiser/+/esp/+/zone/ack` | `ZoneAckHandler` | `MQTTCommandBridge.resolve_ack` | ggf. Audit / Zone-Operationen | vor allem interne Finalisierung |
| `kaiser/+/esp/+/subzone/ack` | `SubzoneAckHandler` | wie oben für Subzone | wie oben | wie oben |
| `kaiser/+/esp/+/system/intent_outcome` (+ **lifecycle**) | `IntentOutcomeHandler` / Lifecycle-Handler | Canonical Outcome, Dedup-Metriken | `audit_logs`, `command_contracts` | WS (falls angebunden) |
| `kaiser/+/esp/+/actuator/+/command`, `.../emergency`, `kaiser/broadcast/emergency` | `mock_actuator_command_handler` | `SimulationScheduler.handle_mqtt_message` | **Kein** klassisches Feldgerät-Ingestion-Schema; Mock-Laufzeit | Antwortpfade über Simulation (nicht Bereich A Standard) |

**HTTP (ergänzend, nicht Primär-Ingestion Messwerte):**

- `GET /api/v1/sensors/data` / `.../by-source/...` — **Lesen** aus DB, keine Geräte-Ingestion.
- `POST /api/v1/sensors/{esp_id}/{gpio}/measure` — **Outbound-Trigger** (MQTT zum ESP), keine direkte Speicherung des Messwerts über diesen Endpoint.
- `POST /api/v1/logs` — Frontend-Log-Ingestion (nicht ESP-MQTT; separater Kanal).
- Debug/Mock-ESP (`api/v1/debug.py`) — legt Konfiguration/Geräte an; **Messwertpfad** der Simulation läuft über MQTT/Scheduler, nicht über einen dokumentierten „REST-Sensor-Ingest“-Ersatz.

---

## 3. Verlust-/Drift-Matrix

**Zeilen:** Risiken. **Spalten:** Pfade (gruppiert). **Zelle:** Kurzbewertung + Codeanker.

| Risiko | Sensor (`…/sensor/…/data`) | Heartbeat (`…/heartbeat`, QoS 0) | Diagnostics / Error | Config response | Discovery / LWT |
|--------|----------------------------|----------------------------------|---------------------|-----------------|-----------------|
| **Drop** (Nachricht kommt nicht an) | Broker/Netz; QoS 1 reduziert, eliminiert nicht; Handler-Timeout 30s → effektiver Drop der Verarbeitung | **QoS 0** — Broker garantiert keine Zustellung; höheres Drop-Risiko als Sensor | Gleiches MQTT-Profil wie Sensor (QoS 1); Validierung kann verwerfen | QoS 2 abonniert — weniger Verlust auf Transportebene | LWT nur bei unclean disconnect; bewusst kein Heartbeat-Ersatz |
| **Duplikat** | `SensorRepository.save_data` gibt `None` bei Duplikat — Handler kehrt mit **True** zurück (kein zweites DB-Row); Metrik/Logic ggf. eingeschränkt | Mehrfache Heartbeats → idempotente Updates möglich; ACK/State-Push kann mehrfach feuern (Cooldowns) | Doppelte Diagnostics überschreiben JSON in `device_metadata` | Audit + DB-Updates — Teilfelder idempotent?, Failures-Array | LWT: `terminal_authority` kann „stale“ ignorieren (`was_stale`) |
| **Reorder** | Parallelität: ThreadPool + `run_coroutine_threadsafe` — **Reihenfolge** der Verarbeitung kann von Publish-Reihenfolge abweichen | gleiches Routing; State hängt von letztem erfolgreichen Write ab | Snapshot-Semantik — letzte gewinnt | Reihenfolge von ACK vs. späterem Sensor kann UI/State verwirren | weniger relevant |
| **Alias-/Contract-Mismatch** | `raw`/`raw_value`, Multi-Value-Adressen — Canonicalisierung in Handler/Formattern | Heartbeat-Contract (`canonicalize_heartbeat`); Firmware-Flags | `canonicalize_diagnostics` / `canonicalize_error_event` | `canonicalize_config_response` + Legacy-Felder | LWT `canonicalize_lwt` |

**Codeanker (Auswahl):**

- Routing, JSON-Fehler, kein Handler: `mqtt/subscriber.py` `_route_message` (~152–209)  
- Duplikat Sensor: `sensor_handler.py` ~444–446; Repo: `sensor_repo.py` Kommentar zu Duplikat ~318–341  
- Stale-Drop Sensor (kein Persist, Rückgabe True): `sensor_handler.py` ~409–418  
- Logic überspringen bei alter Zeit: `sensor_handler.py` ~573–581  
- Critical Inbox: `subscriber.py` `_is_critical_topic` (~306–311), `append` (~187–192)  
- Heartbeat QoS: `subscriber.py` `subscribe_all` (~124–125)  
- LWT stale terminal: `lwt_handler.py` ~136–160  

---

## 4. Parallelitäts- / Reorder-Szenario (Abnahme)

**Sensor:** Zwei MQTT-Publishs **QoS 1** für dieselbe `esp_id`/`gpio` mit Zeitstempeln `t1 < t2`, aber durch Thread-Pool/Last wird `t2` **vor** `t1` committed. **Folge:** „Letzter Write wins“ in `sensor_data`; LogicEngine sieht ggf. zuerst den neueren Wert, dann den älteren — kann zu **kurzem Regel-Toggle** führen, sofern kein strenges Monotonie-Gate pro Sensor-Stream existiert. **Gegenmaßnahme im Code:** Frische-Gate für Logic (`LOGIC_FRESHNESS_SECONDS`); kein globales seq-Ordering über alle Nachrichten.

**Heartbeat:** Mehrere Heartbeats in kurzer Folge; **QoS 0** kann Lücken erzeugen — UI/Health kann zwischen „online“ und verzögertem Update springen; Server-seitig dominieren DB-Updates und Cooldowns (State-Push) über strikte FIFO-Semantik.

---

## 5. A3-Analogon: Ingestion-Integrität (wenn A3 nicht textuell vorliegt)

| Integritätsaspekt | Mechanismus im System | Lücke / Restrisiko |
|-------------------|----------------------|-------------------|
| Transport-Zustellung | MQTT QoS pro Pattern (`subscribe_all`) | Heartbeat QoS 0; keine Ende-zu-Ende-Garantie bis App |
| Parsing | JSON parse fail → Log, `messages_failed++` | Kein Dead-Letter-Topic; reine Logs |
| Idempotenz Sensor | DB-Dedup in `save_data` | Duplikat: **True** ohne neues Event — Consumer ohne DB sehen nichts |
| Korrelation | `generate_mqtt_correlation_id` + ContextVar im Handler-Wrapper | Nicht alle Pfade exposen `correlation_id` nach außen |
| Durability (kritisch) | Inbound-Inbox für subset „critical“ Topics | Nicht alle Ingestion-Pfade inbox-pflichtig; Replay in `replay_pending_events` |
| Finalität Config/Command | Intent-Outcome, Command-Contracts | Siehe S11/S12 für Befehlsketten |

---

## 6. G2 — Ende ohne sichtbaren Fehler / klaren Outcome

Stellen, an denen die Pipeline **ohne** klaren externen Fehler- oder Erfolgs-Outcome enden kann (für Betreiber/UI/Downstream):

1. **Leerer MQTT-Payload** — still verworfen (`subscriber.py` ~164–167).  
2. **Ungültiges JSON** — Log + Zähler, kein DB-Eintrag (`subscriber.py` ~170–175).  
3. **Kein passender Handler** — nur Warning (`subscriber.py` ~204–205).  
4. **Handler `return True` bei Sensor-Duplikat** — kein neuer DB-Row, kein WS-Broadcast des Duplikats (`sensor_handler.py` ~444–446).  
5. **Sensor „stale_drop“** — absichtlich kein Save, Rückgabe **True** (`sensor_handler.py` ~409–418).  
6. **Sensor Logic übersprungen (stale_for_logic)** — Daten können gespeichert sein, Logic nicht ausgeführt (`sensor_handler.py` ~573–581).  
7. **WebSocket broadcast** — best-effort, Exceptions nur Warning (z. B. `sensor_handler.py` ~541–542, `diagnostics_handler.py` ~198–199).  
8. **LWT unbekanntes Gerät** — `return True` ohne State-Change (`lwt_handler.py` ~118–125).  
9. **LWT terminal authority „stale“** — bewusst no-op, `return True` (`lwt_handler.py` ~150–160).  
10. **Diagnostics unbekannte `esp_id`** — `return False` (eher sichtbar im Log als im UI).  
11. **Mock-Command-Handler** — `return None` „nicht anwendbar“ ohne Fehler (`main.py` ~355–375).  
12. **Inbound-Inbox append fehlgeschlagen** — Critical-Event kann ohne Inbox-Id weiterlaufen (`subscriber.py` ~224–250).  
13. **Handler-Timeout 30s** — Fehler gezählt; je nach Client kein MQTT-Feedback (`subscriber.py` ~376–379).

---

## 7. Gap-Liste P0 / P1 / P2 (für Oberauftrag Abschnitt A)

| ID | Schwere | Befund | Bezug |
|----|---------|--------|--------|
| P0-ING-01 | P0 | Heartbeat **QoS 0** vs. Liveness/Register — höheres Drop-Risiko als andere Telemetry | Abnahme Parallelität, Drift-Matrix |
| P0-ING-02 | P0 | **Keine** zentrale sichtbare Fehler-API für verworfene MQTT-Nachrichten (nur Logs/Metriken) | G2 |
| P1-ING-01 | P1 | Sensor-**Reorder** kann Logic kurzzeitig inkonsistent treiben (trotz Frische-Gate) | Abschnitt 4 |
| P1-ING-02 | P1 | **Duplikat-Sensor** — erfolgreiche Semantik ohne Downstream-Event | G2, A3-Analogon |
| P1-ING-03 | P1 | Critical-Inbox deckt nur Teilmenge; andere Ingestion-Pfade nicht gleichwertig durable | A3-Analogon |
| P2-ING-01 | P2 | Abgleich `MQTT_TOPICS.md` vs. Code — Drift-Sektion in S5 ausstehend (Report fehlt) | S5-Abnahme |
| P2-ING-02 | P2 | HTTP ist kein Ersatzkanal für Messwert-Ingestion — dokumentiert für Integrations-Expectations | Pfadatlas |

---

## 8. Abnahme-Check (laut Auftrag)

- **Master-Subscription:** Alle in Abschnitt 1 gelisteten Patterns sind im Pfadatlas abgedeckt oder bei Mock-Command als **out of scope Bereich A** erläutert.  
- **Mindestfamilien:** sensor, heartbeat, diagnostics, error, config_response, discovery, lwt — in Abschnitt 2 adressiert.  
- **Parallelität:** Abschnitt 4 mit Sensor + Heartbeat.  

---

*Erstellt aus IST-Code; vervollständigen sobald Reports S5/S6/S9 vorliegen (Querverweise und Feinbewertung).*
