# Auftrag: Vollstaendige Frontend-Analyse und Zentralisierungsplan (Contract April 2026)

**Datum:** 2026-04-05  
**Ziel-Repo:** AutomationOne (dieses Repo) — Schwerpunkt `El Frontend/`  
**Typ:** Analyseauftrag (IST erfassen, Luecken benennen, Zentralisierungs-SOLL definieren) — Umsetzung erfolgt in Folgeauftraegen  
**Prioritaet:** P0 (Blockiert konsistente Darstellung von Intent-Lifecycle, ESP-Gesundheit und Zone/Subzone-ACKs nach Server-Deployment)  
**Empfohlene Bearbeitung:** Frontend-Inspector / Frontend-Dev-Agent; Abstimmung mit Backend-Contract aus `El Servador/god_kaiser_server/docs/FIRMWARE_CONTRACT_SERVER_2026-04-05.md`

---

## 1) Warum dieser Auftrag (Business + Technik)

Das Dashboard ist die **Integrations-Gate-UI** zwischen Bediener, Server-Wahrheit (DB + MQTT-Ingest) und Firmware-Verhalten. Nach dem Server-Stand **April 2026** existieren zusaetzliche kanonische Signale:

- **Intent-Outcome-Lifecycle** als eigenes Ereignis (nicht nur terminales `intent_outcome`),
- **Erweiterte Intent-Outcome-Semantik** (verschachtelte Daten, bekannte Flows mit unbekanntem Outcome behalten Firmware-**code**),
- **Heartbeat-Runtime-Telemetrie** (`runtime_telemetry` in DB/WebSocket),
- **Degradations-Flags** und Aggregation (Severity mindestens Warning bei Degradation),
- **Optionales `reason_code`** bei Zone/Subzone-ACK ueber Bridge/WebSocket.

Wenn das Frontend diese Signale **teilweise ignoriert**, **anders benennt** oder **lokal neu interpretiert**, entstehen die klassischen IoT-UI-Pathologien: haengende „Pending“-Zustaende, falsche Fehlerursachen, uneinheitliche „degraded“-Darstellung und inkonsistente Operator-Entscheidungen.

**Sollbild nach Analyse:** Eine dokumentierte **Single Source of Truth** pro Domäne (Intent, ESP-Gesundheit, Zone/Subzone, Sensor/Aktor-Live) mit klaren **Adapter-Schichten** (WebSocket/REST → normalisierte Domain-Modelle → Stores → Views). Keine doppelte Parsing-Logik in Widgets.

---

## 2) Systemkontext (fix fuer diesen Auftrag)

### Drei Schichten

1. **Firmware (El Trabajante):** Ausfuehrung, NVS, Safety, MQTT-Publish von Heartbeat, Outcomes, ACKs.  
2. **Server (El Servador):** MQTT-Handler, Validierung, Persistenz, WebSocket-Broadcast, Metriken.  
3. **Frontend (El Frontend):** Vue 3, TypeScript, Pinia, WebSocket + REST, Chart.js (vue-chartjs).

### Frontend-Architektur-Regeln (nicht verhandelbar)

- **HardwareView** ist der Ort fuer **Geraete- und Pin-Konfiguration** (u. a. SensorConfigPanel, ActuatorConfigPanel) im **3-Level-Zoom** (L1 Uebersicht → L2 Orbital/Detail → L3 Modals).  
- **SensorsView** (`/sensors`, Komponenten-Tab) ist **Wissensdatenbank** — **kein** SensorConfigPanel.  
- **Dashboard unter `/dashboard-legacy`:** LEGACY, nicht als Ziel fuer neue Contract-Verdrahtung.  
- **Mock vs. echte ESP:** UI, die nur fuer Simulation gilt (z. B. Heartbeat-Steuerung), darf echte Geraete nicht verwirren.

---

## 3) Backend-/Contract-IST nach Server-Umsetzung April 2026 (in den Auftrag uebernommen)

Dieser Abschnitt ist die **normative Referenz** fuer die Frontend-Analyse. Abweichungen im UI gelten als Defekt, sofern nicht bewusst als „Server noch nicht angebunden“ dokumentiert.

### 3.1 MQTT und Handler

- **Neues Topic-Pattern:** `kaiser/+/esp/+/system/intent_outcome/lifecycle`  
  - Server: Parser, Subscription, dedizierter Handler `intent_outcome_lifecycle_handler.py`.  
  - **Audit:** `event_type=intent_outcome_lifecycle`.  
  - **WebSocket-Event-Name:** `intent_outcome_lifecycle` (exakt pruefen im Server-Code, nicht raten).  
  - **Metrik:** `intent_outcome_lifecycle_total`.  
- **Kritische Topic-Einstufung:** Lifecycle wie `intent_outcome` fuer **Durable Inbox** (`subscriber._is_critical_topic`).  
- **`intent_outcome_handler`:**  
  - Vor Validierung: `merge_intent_outcome_nested_data()`.  
  - `CONTRACT_UNKNOWN_CODE`-Metrik nur bei **tatsaechlich** diesem Code.  
  - Zaehler `intent_outcome_firmware_code_total` gruppiert nach Flow/Code (Observability; UI kann optional Spiegel fuer Debug-Modus nutzen).

### 3.2 Vertragscode

- **`intent_outcome_contract.py`:** Kanonische Flows u. a.: `zone`, `subzone_assign`, `subzone_remove`, `subzone_safe`, `offline_rules`.  
- **Regel:** Bei **bekanntem Flow** aber **unbekanntem Outcome** bleibt ein gesetzter Firmware-**code** erhalten (nicht pauschal `CONTRACT_UNKNOWN_CODE` ersetzen).  
- **`system_event_contract.canonicalize_heartbeat`:** Zusaetzliche Telemetrie-Felder werden **durchgereicht** (Frontend muss unknown keys tolerant behandeln oder explizit filtern).

### 3.3 Heartbeat und Datenbank

- **Spalte** `runtime_telemetry` (JSONB/JSON) auf `esp_heartbeat_logs` — Migration **`esp_hb_runtime_telemetry`** (nach `add_contract_shadow_fields_to_command_outcomes`).  
- **Health-Ermittlung** (`determine_health_status`) beruecksichtigt u. a.:  
  `persistence_degraded`, `runtime_state_degraded`, `network_degraded`, Circuit-Breaker-Flags (Details im Server-Repo).  
- **`heartbeat_handler`:** `observe_heartbeat_firmware_flags`, WebSocket **`esp_health`** inkl. Telemetrie ueber `serialize_esp_health_event(..., runtime_telemetry=...)`.  
- **`event_aggregator_service`:** `runtime_telemetry` in Metadaten; Severity **mindestens warning** bei Degradations-Flags.

### 3.4 Zone / Subzone ACK

- Optional **`reason_code`:** Metrik `mqtt_ack_reason_code_total`, Bridge-`ack_data`, WebSocket-Payload; bei Subzone: Feld in `SubzoneAckPayload`.

### 3.5 Simulation / Mocks (Server)

- Mock-Heartbeat: **`ts` in Sekunden**, `system_state`, `metrics_schema_version`, typische Firmware-Telemetrie-Defaults.

### 3.6 Metriken (Server)

- u. a. `intent_outcome_firmware_code_total`, `intent_outcome_lifecycle_total`, `mqtt_ack_reason_code_total`, `heartbeat_firmware_flag_total` — fuer Frontend relevant, falls **System-Monitor** oder **Debug-Panels** Prometheus-API oder aggregierte REST nutzen.

### 3.7 Deployment-Hinweis (Ops, nicht Frontend-Code)

```text
cd "El Servador/god_kaiser_server"
python -m alembic upgrade head
```

Revision: **`esp_hb_runtime_telemetry`**.

---

## 4) Ziel der Analyse (messbar)

Erstelle einen **Frontend-Gesamtbericht** (Markdown im Auto-One Repo, Vorschlag: `.claude/auftraege/ergebnisse/analyse-frontend-contract-april2026-<datum>.md`) mit:

1. **Vollstaendigem Inventar** aller Stellen, die **REST**, **WebSocket**, **Pinia-Stores**, **Router-Views** und **wiederverwendbare Komponenten** fuer die Domänen Intent/Outcome, ESP-Health, Zone/Subzone, Config/Command, Notifications beruehren.  
2. **Ereignis-Matrix:** Jeder vom Server emitierte **WebSocket-Event-Name** (inkl. neue und geaenderte Payloads) → **aktuelle** Frontend-Handler → **normalisiertes** Zielmodell.  
3. **Zentralisierungsplan:** Fuer jede doppelte Logik: **eine** kanonische Modul-Stelle (Vorschlag: `src/domain/` oder `src/services/contracts/` + duenne Composables), und Liste der **Konsumenten** (Komponenten), die umzubinden sind.  
4. **Drift-Risiken:** z. B. `degraded` ohne Kontext, fehlende `correlation_id`, verwechselte Zeitbasis (ms vs. s), Legacy-Aliase (`raw` vs. `raw_value`).  
5. **Priorisierte Umsetzungs-Backlog** (P0/P1/P2) mit **Akzeptanzkriterien pro Paket**.

---

## 5) Pflicht-Inventur-Bereiche (codegestuetzt, nicht schaetzen)

Gehe **alle** der folgenden Bereiche im Repo systematisch durch (Pfade ggf. an tatsaechliche Struktur anpassen):

| Bereich | Zu pruefende Artefakte |
|--------|-------------------------|
| **Einstieg** | `El Frontend/src/main.ts`, Router-Definition, App-Layout, globale Error-Handler |
| **Views** | Alle unter `El Frontend/src/views/` (inkl. Hardware, Monitor, Custom Dashboard, Logic, System-Monitor, Settings, Maintenance, Calibration, Plugins, Users, Login, Setup) |
| **Komponenten** | `El Frontend/src/components/**` — insbesondere Hardware/ESP, Sheets, Orbitals, Status-Badges, Toasts, Command-Panels |
| **Stores** | `El Frontend/src/shared/stores/**`, ggf. Legacy `src/stores/**` — Datenfluss, Mutationen, Persistenz |
| **WebSocket** | `useWebSocket` und alle Subscriber; Event-Type-Definitionen (TS types/enums) |
| **API-Clients** | `El Frontend/src/api/**` — Zone, Subzone, ESP, Commands, Health, Maintenance |
| **Composables** | `El Frontend/src/composables/**` — Korrelation, Polling, Zoom, Notifications |
| **Design-System** | `El Frontend/src/shared/design/**` — Semantik von Status-Farben/Badges (muss zu Health/Outcome passen) |
| **Tests** | `El Frontend/tests/unit/**`, E2E — Abdeckung fuer neue Events und State-Maschinen |

**Zusaetzlich:** Suche nach String-Literalen der Event-Namen (`intent_outcome`, `esp_health`, `intent_outcome_lifecycle`, `zone`, `subzone`, `ack`) und nach **ad-hoc** `JSON.parse` oder ungetypten `any`-Pfaden.

---

## 6) Domänen-spezifische Analysefragen (muessen beantwortet werden)

### 6.1 Intent Outcome + Lifecycle

- Wird **nur** terminales `intent_outcome` ausgewertet, oder gibt es bereits Lifecycle-Stufen?  
- Wie werden **verschachtelte Daten** nach `merge_intent_outcome_nested_data` im Payload dargestellt (Operator-LESBAR)?  
- Wie wird der Fall **bekannter Flow + unbekannter Outcome + gesetzter Firmware-code** angezeigt (nicht als generischer „Vertragsfehler“ missverstanden)?  
- Ist die **Intent-Statusmaschine** (pending → terminal) **eine** Implementierung, oder dupliziert in mehreren Komponenten?  
- **Idempotenz:** Wie verhaelt sich die UI bei doppelten terminalen Events und bei Events nach Terminalitaet?

### 6.2 ESP-Gesundheit und Heartbeat-Telemetrie

- Wo wird `esp_health` verarbeitet?  
- Werden **neue** `runtime_telemetry`-Felder angezeigt oder zumindest **strukturiert** in einem Debug-/Admin-Panel?  
- Wie werden **Degradations-Flags** (`persistence_degraded`, `runtime_state_degraded`, `network_degraded`, CB-Flags) **einheitlich** benannt und eingefaerbt?  
- Gibt es noch Stellen, die **nur** `heap`/`wifi_rssi` als „Gesundheit“ interpretieren?

### 6.3 Zone / Subzone und ACK

- Wo werden **Zone-ACK** und **Subzone-ACK** dargestellt?  
- Ist **`reason_code`** (sofern vorhanden) sichtbar und wird es **nicht** mit Outcome-Codes vermischt?  
- Konsistenz zwischen **REST-Refresh** und **WebSocket-Update** nach Zuweisung/Entfernung/Safe-Mode?

### 6.4 Zeit und Einheiten

- Server-Simulation und Telemtry nutzen **`ts` in Sekunden** — wo im Frontend wird noch **Millisekunden** angenommen? Liste aller betroffenen Formatter/Charts.

### 6.5 System-Monitor / Observability

- Wenn UI Metriken oder Logs zeigt: sind neue Metriken-Namen abbildbar? Falls nicht: ist das **bewusst** out-of-scope?

---

## 7) Zentralisierungs-SOLL (Vorgaben fuer den Plan-Teil der Analyse)

Die Analyse soll **konkrete Vorschlaege** machen, keine vagen „refactor“-Wuensche:

1. **Contract-Adapter-Schicht**  
   - Eine Stelle, die **WebSocket-Rohpayloads** in **stabile Domain-Objekte** uebersetzt (Versionierung/Future-Fields: „strip unknown“ vs. „preserve for debug“ dokumentieren).  
2. **Intent-Modul**  
   - Korrelation, Lifecycle, terminales Outcome, Fehlerdarstellung, Timeout-Semantik (**Timeout darf nicht terminal „failed“ simulieren** ohne Outcome — konsistent mit frueheren Operator-Anforderungen).  
3. **ESP-Health-Modul**  
   - Einheitliche Ableitung von **Badge-Text**, **Severity**, **Tooltip-Grund**, **Empfohlene Aktion** aus `esp_health` + `runtime_telemetry`.  
4. **ACK-Modul**  
   - Zone/Subzone: gemeinsame Darstellung von Erfolg/Fehler + optionalem `reason_code`.  
5. **Keine Geschaeftslogik in Chart-Widgets**  
   - Charts bekommen bereits normalisierte Zeitreihen; keine MQTT-Feldnamen in UI-Zweigen verstreut.

Fuer jedes Modul: **Dateivorschlag**, **Export-API** (Funktionen/Typen), **Migrationsschritte** von den aktuell betroffenen Komponenten.

---

## 8) Abgrenzung (explizit nicht Teil der Umsetzung in diesem Auftrag)

- Keine Aenderung der **Firmware**.  
- Keine **Server**-Implementierung (nur Frontend-seitige Anpassung planen; Server-IST ist oben fixiert).  
- Kein **Redesign** des Design-Systems aus rein aisthetischen Gruenden.  
- Keine neue **Chart-Bibliothek** (Chart.js bleibt).

---

## 9) Akzeptanzkriterien fuer die Analyse-Lieferung

- [ ] Vollstaendige **View- und Store-Liste** mit Zuordnung zu den Domänen (Intent, Health, Zone/Subzone, Sensor/Aktor, Logic).  
- [ ] Vollstaendige **WebSocket-Event-Matrix** inkl. **neuer** Events aus April-2026-Server (mindestens `intent_outcome_lifecycle`, erweitertes `esp_health`).  
- [ ] Mindestens **10** konkrete **Zentralisierungs-Ziele** mit „IST: doppelt in A+B“ → „SOLL: Modul M“.  
- [ ] Klarer **P0-Block** fuer Operator-Irritationen (falsche Terminalitaet, falsche Degraded-Semantik, ACK ohne reason).  
- [ ] **Testluecken** benannt (Vitest/Playwright), die nach Umsetzung geschlossen werden muessen.  
- [ ] Kurzes **Glossar** im Bericht: Begriffe **Lifecycle**, **Outcome**, **ACK reason_code**, **runtime_telemetry**, **degraded-Flags** — wie sie in der UI bezeichnet werden sollen (eine Sprache).

---

## 10) Vorgehen (Arbeitsschritte fuer den ausfuehrenden Agenten)

1. Server-Doku **`FIRMWARE_CONTRACT_SERVER_2026-04-05.md`** lesen und mit Code-Stellen (WS-Serialisierung) abgleichen — **Feldnamen exakt** uebernehmen.  
2. Im Frontend alle WebSocket-Subscriptions und Typdefinitionen extrahieren.  
3. Pinia-Stores nach **Mutationsquellen** (REST vs WS) clustern.  
4. HardwareView/MonitorView/SystemMonitorView gezielt auf **Doppellogik** pruefen.  
5. Bericht schreiben + P0/P1/P2-Backlog.  
6. Optional: **Folgeauftrag** pro P0-Paket erstellen (chirurgisch, eine Verantwortlichkeit pro Auftrag).

---

## 11) Kurz-Glossar (fuer einheitliche UI-Sprache)

- **Intent:** Server-seitig verfolgter Steuerungsvorgang mit Korrelation; kann mehrere Zwischenstufen haben.  
- **Lifecycle-Event:** Nicht-terminaler Fortschritt/Fehlerpfad, der **separat** vom terminalen Outcome kommuniziert wird (`intent_outcome_lifecycle`).  
- **Terminal Outcome:** Abschluss des Intents (`success`, `failed`, `rejected`, `expired`, `dropped` — exakte Enum am Server pruefen).  
- **Firmware-Code:** Hersteller-/Firmware-spezifischer Code-String; bei unbekanntem Outcome **nicht** silent durch generischen Vertragscode ersetzt.  
- **runtime_telemetry:** Strukturierte Laufzeitinfos aus Heartbeat-Ingest (kann sich erweitern).  
- **reason_code (ACK):** MQTT-/Bridge-Grund fuer Zone/Subzone-ACK; semantisch **nicht** identisch mit Intent-Outcome-Codes.

---

**Ende Auftrag**
