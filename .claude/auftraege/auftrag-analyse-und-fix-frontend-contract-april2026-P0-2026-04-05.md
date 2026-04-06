# Analyse- und Fixauftrag: El Frontend — Contract April 2026 (P0–P2)

**Datum:** 2026-04-05  
**Repo:** AutomationOne (dieses Repo)  
**Schwerpunkt:** `El Frontend/`  
**Normative Referenz:** `El Servador/god_kaiser_server/docs/FIRMWARE_CONTRACT_SERVER_2026-04-05.md`  
**Ergänzende Event-Doku:** `.claude/reference/api/WEBSOCKET_EVENTS.md` (Stand 2026-04-05)  
**Typ:** Analyse (IST/Lücken) + **ausführbare** Fix-Pakete P0-A bis P0-D mit Abnahmekriterien  
**Verify-Plan (2026-04-05):** Gegen realen Code geprüft (u. a. `esp.ts`, `useWebSocket`, `zone.store.ts`, `types/index.ts` `MessageType`, `eventTypeLabels.ts`, Server `intent_outcomes.py`, `event_contract_serializers.py`). Nachfolgende Korrekturen gegenüber früherer Formulierung sind **verbindlich**.

---

## Teil A — Fachliche und technische Einordnung (vollständig erklärt)

### A.1 Drei parallele „Wahrheiten“ im System

AutomationOne liefert dem Bediener **keine** einzelne synchrone Antwort pro Aktion, sondern **mehrere asynchrone Kanäle**:

1. **REST** liefert oft nur „Dispatch akzeptiert“ (Server hat den Befehl übernommen), nicht die physische Endlage auf dem ESP.  
2. **MQTT** transportiert Firmware- und Bridge-Semantik (ACKs, Outcomes, Heartbeat-Telemetrie).  
3. **WebSocket** spiegelt vom Server aufbereitete Ereignisse ins Dashboard.

Wenn das Frontend **nur** einen dieser Kanäle vollständig abbildet, entstehen **scheinbar gesunde** Geräte bei **degradierter** Laufzeit, **hängende** Vorgänge ohne erklärenden Zwischenstand, oder **stille** UI-Updates (Events kommen am Browser an, erreichen aber keine Handler).

**Sollbild:** Pro Domäne (Intent/Outcome, ESP-Gesundheit, Zone/Subzone) gibt es **normalisierte View-Models** und **eine** konsistente Pflicht zur Darstellung kritischer Signale — nicht verstreute Ad-hoc-Parsing-Pfade in Widgets.

### A.2 Was der Server April 2026 zusätzlich „kanonisch“ macht

Ohne diese Signale vollständig zu integrieren, ist die UI **contract-fern**, obwohl der Server bereits korrekt liefert:

| Signal | Bedeutung für den Operator |
|--------|----------------------------|
| **`intent_outcome`** | Terminaler Abschluss eines **MQTT-/Server-verfolgten** Intents (nicht identisch mit reinem `actuator_response`-Pfad für alle Domänen). |
| **`intent_outcome_lifecycle`** | **Nicht-terminaler** Fortschritt (z. B. Konfiguration in Zwischenzuständen wie Pending) — erklärt „warum noch nicht fertig“, ohne fälschlich „Fehler“ zu raten. |
| **`esp_health` + aus `runtime_telemetry` gespreizte Felder** | Gerät kann **online** sein und trotzdem **eingeschränkt** (Persistenz, Runtime, Netzwerk, Circuit Breaker). Nur Heap/RSSI reicht nicht. |
| **Zone/Subzone-ACK mit optionalem `reason_code`** | **Brücken-/MQTT-Grund** für die Zuweisung — semantisch **nicht** derselbe Raum wie ein Intent-`code` oder ein generisches Toast-`message`. |

Die Server-Implementierung mischt `runtime_telemetry` bewusst **flach** in die WebSocket-Payload (`event_contract_serializers.py`: Schleife über Key/Value in `payload`). Das Frontend muss das **entweder** explizit wieder als „Telemetrie-Block“ modellieren **oder** dokumentiert filtern — aber nicht „wegwerfen durch Nicht-Mapping“.

### A.3 Warum `actuator.store` allein nicht reicht

Der aktuelle Stand (IST) ist für **Actuator-/Config-/Sequence-Intents** über `actuator.store.ts` und `contractEventMapper.ts` bereits **relativ contract-nah** (Korrelation, vorsichtige Timeout-Semantik ohne heuristische Terminalität).

**Lücke:** Die **kanonische** Intent-Outcome-Pipeline der Server-Seite (`intent_outcome`, `intent_outcome_lifecycle`) ist im Frontend **gar nicht verdrahtet**. Folge:

- Operator sieht **keine** Server-Wahrheit für Flows, die primär über dieses Kanalmodell laufen.  
- **Lifecycle** und **terminal** können nicht getrennt dargestellt werden.  
- Fälle „bekannter Flow, unbekannter Outcome, aber Firmware-`code` gesetzt“ sind **ohne Ingest** nicht erklärbar.

### A.4 Der WebSocket-Filter-Bug (P0) — Mechanik Schritt für Schritt

Im Frontend gibt es **zwei** Wege, WebSocket-Nachrichten zu verarbeiten:

1. **`websocketService.handleMessage`** ruft für eingehende Messages typischerweise **zwei** Mechanismen auf (vereinfacht):  
   - **Subscription-Pfad:** Nur Nachrichten, die **`matchesFilters`** für aktive Subscriptions erfüllen, werden an Subscription-Callbacks weitergereicht.  
   - **Listener-Pfad:** Registrierte globale Listener pro `message.type`.

2. **`useWebSocket`** (Composable): Wenn eine **Subscription mit `filters.types`** aktiv ist, registriert `on()` **keinen** globalen `websocketService.on`-Listener, sondern nur **lokale** Handler, die **ausschließlich** vom Subscription-Callback mit **bereits gefilterten** Events beliefert werden.

**Konsequenz für `esp.store.ts`:** Alle Event-Typen, für die in derselben `useWebSocket`-Instanz `ws.on('…', handler)` registriert ist, **müssen** auch in `filters.types` stehen. Fehlt der Typ dort, sieht der Subscription-Pfad diese Events **nie** — die Handler laufen dann **faktisch nicht**, obwohl der Code sie „registriert“ hat.

**Betroffene Events (IST-Lücke, verifiziert im Code):** u. a. `notification_new`, `notification_updated`, `notification_unread_count`, `sensor_config_deleted`, `actuator_config_deleted` — Handler existieren (Kommentar/Registrierung zu `sensor_config_deleted` um Zeile ~1687), **fehlen** aber in `filters.types` (Zeilen ~134–144).

**Operator-Folgen:**

- **Inbox** (`notification-inbox.store`) kann leer bleiben oder veralten, obwohl der Server sendet.  
- **Ghost-Konfigurationen** auf dem Gerät, wenn `sensor_config_deleted` / `actuator_config_deleted` die lokale Geräteansicht nicht bereinigen.

Das ist ein **Integrations-P0**, unabhängig vom April-2026-Contract — und **blockiert** zugleich saubere Erweiterung um `intent_outcome*`, weil dieselbe Filterliste gepflegt werden muss.

**Hinweis `logic_execution`:** Der Typ steht bereits in `filters.types`, wird in `esp.ts` aber **nicht** per `ws.on` behandelt — stattdessen eigenes Muster in `logic.store.ts`. Das ist **unkritisch** (höchstens „überabonniert“ im ESP-Subscription-Pfad); kein P0-Fix nötig, solange kein zweiter konkurrierender Handler dieselbe Instanz braucht.

### A.5 Zone/Subzone und `reason_code`

`zone.store.ts` definiert `ZoneAssignmentPayload` / `SubzoneAssignmentPayload` **ohne** `reason_code`. Toasts und Logs können daher nur generische Texte zeigen. Für Diagnose und Schulung ist eine **klare Trennung** nötig:

- **Intent-Fehlercode** / Outcome-Code  
- **Brückengrund (ACK)** = `reason_code` bei Zone/Subzone

UI-Bezeichnung (Vorschlag, einheitlich): **„Brückengrund (Zone)“** / **„Brückengrund (Subzone)“** — nicht „Fehlercode“ im Intent-Sinne.

### A.6 Zeitbasen (Sekunden vs. Millisekunden)

Server und Simulation nutzen für Heartbeat/Telemetrie **`ts` in Sekunden**. Im Frontend existiert in `esp.ts` eine **Heuristik** (große Zahlen = ms). Das ist für Übergang/Altlasten vertretbar, birgt aber **Drift-Risiko**, sobald neue numerische Telemetrie-Felder ohne klare Einheit in Charts landen. Nach den Fixes: **zentrale Normalisierung** dokumentieren (Adapter), nicht pro Widget raten.

---

## Teil B — Executive Summary (IST)

1. **`intent_outcome` / `intent_outcome_lifecycle`:** Im gesamten `El Frontend/src` **keine** Referenzen — keine Handler, keine Typen, kein REST-Client. **Server-REST existiert bereits** (`god_kaiser_server/src/api/v1/intent_outcomes.py`, Mount unter App `prefix="/api"` → öffentliche URL **`/api/v1/intent-outcomes`**). Axios im Frontend nutzt typischerweise **`baseURL: '/api/v1'`** (vgl. `.claude/reference/api/REST_ENDPOINTS.md`: Pfad **`/intent-outcomes`** relativ zu dieser Basis) → Client-Aufruf z. B. **`get('intent-outcomes')`** oder **`get(\`intent-outcomes/${id}\`)`** — **nicht** erneut `/v1/...` anhängen (Doppel-`/v1/` vermeiden).  
2. **`esp_health`:** Payload wird nicht als **Domain-Objekt** mit Telemetrie/Degradation normalisiert; sichtbar bleiben klassische Größen (online/offline, Heap, RSSI, Uptime, GPIO).  
3. **Zone/Subzone:** `reason_code` **nicht** typisiert und **nicht** in Toasts/Details ausgewiesen.  
4. **WebSocket-Filter in `esp.ts`:** Registrierte Handler für u. a. `notification_*`, `sensor_config_deleted`, `actuator_config_deleted` **fehlen** in `filters.types` → Subscription-Pfad **droppt** diese Events (**P0**).

---

## Teil C — Fixauftrag in Paketen (Umsetzungsreihenfolge)

**Allgemeine Regeln für alle Pakete:**

- Keine neuen Chart-Bibliotheken; Chart.js bleibt.  
- `SensorsView` weiterhin **ohne** SensorConfigPanel.  
- Legacy-Route `/dashboard-legacy` nicht für neue Verdrahtung nutzen.  
- Änderungen **rückwärtskompatibel**: unbekannte WS-Felder nicht crashen lassen.  
- Nach jedem Paket: relevante **Vitest**-Tests grün; bei P0-A zusätzlich **Regressionstest** Filter vs. Handler.

### Vorbedingungen (TM / CI — vor Start abhaken)

- [ ] **Vitest:** Im Verzeichnis `El Frontend` ausführbar (`npx vitest run` o. ä.), damit neue Regressionstests laufen.  
- [ ] **P0-B manuell:** Simulierte WS-Payloads für `intent_outcome` / `intent_outcome_lifecycle` (laut `WEBSOCKET_EVENTS.md`) oder Mock-ESP/Server, der diese Events sendet.  
- [ ] **REST Intent-Outcomes:** GET `/api/v1/intent-outcomes` ist **JWT-geschützt** — für manuelle/API-Abnahme gültiges Token bereithalten.

---

### P0-A — WebSocket-Filter mit allen registrierten Handlern synchronisieren

**Problem:** `useWebSocket({ filters: { types: [...] } })` in `El Frontend/src/stores/esp.ts` filtert Events **vor** Auslieferung an die lokalen `ws.on`-Handler. Jeder Handler-Typ **muss** in `filters.types` stehen.

**Aufgaben:**

1. In `initWebSocket` (oder gleichwertiger Zentralstelle) **alle** `ws.on('EVENT', …)`-Typen extrahieren (statische Liste oder Hilfsconst).  
2. `filters.types` (`MessageType[]`) so erweitern, dass die Vereinigungsmenge **vollständig** ist. **Mindestens ergänzen:**  
   - `notification_new`  
   - `notification_updated`  
   - `notification_unread_count`  
   - `sensor_config_deleted`  
   - `actuator_config_deleted`  
3. Sobald P0-B umgesetzt ist, **ebenfalls** aufnehmen: `intent_outcome`, `intent_outcome_lifecycle` (und jeden weiteren Typ, für den in derselben Instanz ein Handler existiert).  
4. **`MessageType`-Union in `El Frontend/src/types/index.ts` (Verify-Plan):** Nicht nur `filters.types` pflegen — die Union muss **explizit** um **alle** Typen erweitert werden, die (a) in `filters.types` stehen **und** (b) neu hinzukommen. **IST:** `sensor_config_deleted` / `actuator_config_deleted` sind in der Union bereits vorhanden; **`notification_new`**, **`notification_updated`**, **`notification_unread_count`** sowie **`intent_outcome`** / **`intent_outcome_lifecycle`** fehlen (letztere komplett). **SOLL:** Union und Filterliste **gemeinsam** erweitern, damit TypeScript keine „String-Literale unter der Union“ erzwingt und keine Diskrepanz zur Subscription entsteht.

**Abnahmekriterien:**

- [ ] Jeder in `esp.ts` registrierte `ws.on`-Typ ist in `filters.types` enthalten.  
- [ ] Jeder in `filters.types` verwendete Typ ist in der **`MessageType`**-Union in `types/index.ts` deklariert (inkl. P0-B-Events nach deren Implementierung).  
- [ ] Manuell oder per Test: simulierte WS-Nachricht `notification_new` aktualisiert `notification-inbox.store` im **normalen** App-Lauf (Subscription aktiv).  
- [ ] `sensor_config_deleted` entfernt/bereinigt die betroffene Sensor-Referenz auf dem `ESPDevice` wie vorgesehen (bestehende Handler-Logik wird tatsächlich ausgeführt).  
- [ ] Neuer Regressionstest (siehe Teil E): „Handler registriert, aber nicht in filters.types“ darf im CI nicht wieder eingeführt werden.

**Einschränkung:** Keine Refaktorisierung des gesamten WebSocket-Stacks — nur **Korrektur der Filterliste**, **`MessageType`-Erweiterung**, plus Test.

**P0-A Regressionstest (Empfehlung Verify-Plan):** Zwei **deduplizierte** String-Arrays vergleichen — (1) registrierte `ws.on`-Typen, idealerweise aus **einer exportierten Konstante** neben `initWebSocket`, (2) `filters.types` — ohne AST-Parsing; reine Mengen-/Subset-Prüfung, damit die Listen nicht wieder auseinanderlaufen.

---

### P0-B — `intent_outcome` und `intent_outcome_lifecycle` anbinden

**Problem:** Server sendet kanonische Outcomes und Lifecycle-Events; Frontend ignoriert sie vollständig.

**Aufgaben:**

1. **Typen:** An Server-Payload und `WEBSOCKET_EVENTS.md` anbinden — Felder inkl. `correlation_id` / `intent_id` (exakte Namen aus Doku/Code übernehmen).  
2. **Handler:** In `esp.ts` (oder dedizierter Store) `ws.on('intent_outcome', …)` und `ws.on('intent_outcome_lifecycle', …)` — dieselbe `useWebSocket`-Instanz wie bisher; **`filters.types` und `MessageType`** um beide Typen ergänzen (gleiche Fehlerklasse wie P0-A).  
3. **Zustandsmodell:** Minimalziel:  
   - **Lifecycle** aktualisiert einen **nicht-terminalen** Zustand / Log pro Korrelation.  
   - **Terminal** `intent_outcome` setzt final und ist **idempotent** (doppeltes Event = kein Flackern).  
   - Kein Überschreiben terminaler Zustände durch spätere Lifecycle-Messages (Policy dokumentieren im Code-Kommentar).  
4. **UI (Minimal für P0):**  
   - **System Monitor** (Contract-Validierung / Event-Vorschau): Events sichtbar und lesbar.  
   - **Device-Detail / HardwareView** (sinnvoller Ort festlegen): kompakte Zeile „Vorgang: Zwischenstand“ vs. „Ergebnis“, mit Kurz-ID.  
5. **Optional aber empfohlen:** REST-Client z. B. `api/intentOutcomes.ts` — Aufrufe **`get('intent-outcomes')`** / **`get(\`intent-outcomes/${id}\`)`** gegen **`baseURL '/api/v1'`** (volle URL **`/api/v1/intent-outcomes`**). Die Server-API ist **bereits implementiert**; es geht nicht um neue Backend-Erfindung, sondern um **Frontend-Client + Auth-Header (JWT)** + Hydration beim Seitenload (Parität „REST + WS“). Wenn REST bewusst weggelassen wird, im PR **explizit** als Follow-up kennzeichnen.

**Abnahmekriterien:**

- [ ] Bei simulierten WS-Payloads erscheinen beide Typen in der UI (System Monitor mindestens).  
- [ ] Terminal und Lifecycle sind **visuell und textlich** unterscheidbar (Glossar Begriffe).  
- [ ] Bekannter Flow mit unbekanntem Outcome zeigt **Firmware-`code`** nicht als pauschalen „Vertragsfehler“, wenn Server ihn mitschickt (Anzeige „Firmware-Code“).  
- [ ] `contractEventMapper` / `validateContractEvent` (falls genutzt) kennt die neuen Typen — keine dauerhaften `contract_unknown_event` für gültige Server-Events im Normalbetrieb.  
- [ ] REST-Abnahme (falls umgesetzt): Authentifizierter GET auf **`/api/v1/intent-outcomes`** liefert erwartetes JSON; kein falscher Pfad mit doppeltem `/v1/`.

---

### P0-C — `esp_health` normalisieren und Degradation sichtbar machen

**Problem:** Server spreizt `runtime_telemetry` top-level; Frontend mappt nicht auf ein View-Model; Degradations-Flags fehlen in Badges/Tooltips.

**Aufgaben:**

1. **Adapter** `normalizeEspHealthPayload(raw): EspHealthViewModel` (Vorschlagspfad: `src/domain/esp/espHealth.ts` oder `src/domain/ws/adapters.ts`):  
   - Bekannte Heartbeat-Felder weiterhin auf `ESPDevice` aktualisieren.  
   - Bekannte Degradations-Flags (`persistence_degraded`, `runtime_state_degraded`, `network_degraded`, CB-Flags laut Server-Doku) **explizit** auslesen.  
   - Unbekannte zusätzliche Keys optional in `rawTelemetry: Record<string, unknown>` oder äquivalent für Debug-Panel.  
2. **Presentation:** `espHealthPresentation(viewModel)` → `badge`, `severity`, `tooltip`, `recommendedAction` (kurz, deutsch).  
3. **UI:** Mindestens **ein** Ort (z. B. `ESPHealthWidget`, `ESPCard`, oder System-Monitor-ESP-Zeile): Wenn ein Degradations-Flag gesetzt ist, **nicht** nur „online“ anzeigen — mindestens Warn-Badge + Tooltip.  
4. Typ `ESPHealthEvent` in `websocket-events.ts` mit **Realität** abstimmen (gpio als Array vs. Record, etc.).

**Abnahmekriterien:**

- [ ] Simuliertes `esp_health` mit `persistence_degraded: true` zeigt **Warnstufe** sichtbar auf Hardware- oder Monitor-UI.  
- [ ] Kein Stille-Wegwerfen unbekannter Telemetrie-Schlüssel ohne Debug-Sicht (eingeklappte „Laufzeit-Details“ genügt).  
- [ ] Unit-Test: Adapter + Presentation mit Fixture aus Server-Doku.

---

### P0-D — Zone/Subzone-ACK: `reason_code` typisieren und darstellen

**Problem:** `ZoneAssignmentPayload` / `SubzoneAssignmentPayload` ohne `reason_code`; Toasts generisch.

**Aufgaben:**

1. Payload-Interfaces in `zone.store.ts` um **optionales** `reason_code?: string` (oder engerer Typ, falls Server enum liefert) erweitern.  
2. **Presentation-Helper** `formatZoneAck`, `formatSubzoneAck` (Vorschlag: `src/domain/zone/ackPresentation.ts`):  
   - Erfolg: optional „Brückengrund: …“ nur wenn gesetzt.  
   - Fehler: `message` + getrennt `reason_code`-Zeile.  
3. Toasts und ggf. `ZoneAssignmentPanel`-Dokumentation aktualisieren.  
4. **`El Frontend/src/utils/eventTypeLabels.ts` (Verify-Plan):** **`subzone_assignment`** fehlt dort aktuell — **ergänzen**. Nach P0-B sinnvoll ebenfalls Labels für **`intent_outcome`** und **`intent_outcome_lifecycle`** (einheitlich mit System Monitor / Event-Vorschau). Ziel: **eine** konsistente Quelle für Anzeigenamen, keine verstreuten Sonderfälle.

**Abnahmekriterien:**

- [ ] WS-Fixture mit `reason_code` erscheint in Toast oder Detail-Panel als **„Brückengrund (Zone/Subzone)“**.  
- [ ] Kein mischen mit Intent-Outcome-Codes in derselben Zeile ohne Kontext.  
- [ ] Unit-Test für `ackPresentation`.  
- [ ] `eventTypeLabels` enthält mindestens **`subzone_assignment`**; nach P0-B optional **`intent_outcome`** / **`intent_outcome_lifecycle`**.

---

## Teil D — P1 / P2 (nach P0, kurz)

| Stufe | Inhalt |
|-------|--------|
| **P1-A** | Domain-Adapter-Schicht ausrollen; `message.data as any` in neuen Pfaden vermeiden. |
| **P1-B** | `contractEventMapper.WS_EVENT_TYPES` / Registry vollständig vs. Server (41+ Events); fehlende Labels. |
| **P1-C** | `esp_reconnect_phase` — weniger Flackern in HardwareView, Phasenanzeige. **Sobald** ein Handler dafür in **derselben** `useWebSocket`-Instanz wie `esp.ts` landet: Typ **zusätzlich** zu `filters.types` **und** zu **`MessageType`** aufnehmen (gleiche Fehlerklasse wie P0-A). |
| **P2-A** | Prometheus-Metriken im UI nur nach Product-Owner-Entscheid. |
| **P2-B** | Plugin-Execution-WS optional an `PluginsView`. |

---

## Teil E — Testpflicht (mit P0-A-Regression)

| Test | Zweck |
|------|--------|
| **Neu:** `ws.on`-Typen vs. `filters.types` (zwei Arrays / exportierte Konstante) | Verhindert Wiederholung des P0-Bugs; ohne AST-Parsing (Verify-Plan). |
| **Neu:** `intent_outcome` / Lifecycle Adapter + Store-Transition | Unit. |
| **Neu:** `esp_health` mit Degradations-Flags | Adapter/Presentation Snapshot. |
| **Neu:** `ackPresentation` mit `reason_code` | Unit. |
| **E2E (optional):** Degradation sichtbar; Lifecycle vor Terminal | Playwright. |

---

## Teil F — Glossar (UI-Sprache, verbindlich für neue Texte)

| Begriff | UI-Bezeichnung |
|---------|----------------|
| Intent / Vorgang | „Vorgang“ / „Aktion“ + kurze Korrelations-ID |
| `intent_outcome_lifecycle` | „Zwischenstand (Konfiguration)“ o. ä. |
| Terminal `intent_outcome` | „Ergebnis“ |
| Firmware-`code` | „Firmware-Code“ (nicht pauschal „Vertragsfehler“) |
| Aus Heartbeat/JSONB, flach gespreizt | „Laufzeit-Details“ / „Geräte-Telemetrie“ |
| `reason_code` (ACK) | „Brückengrund (Zone)“ / „Brückengrund (Subzone)“ |

---

## Teil G — Code-Belege (IST, zur Orientierung)

**WebSocket-Filter in `esp.ts` (aktuell ohne `notification_*`, `sensor_config_deleted`, …):**

```134:144:El Frontend/src/stores/esp.ts
      types: [
        'esp_health', 'sensor_data', 'actuator_status', 'actuator_alert',
        'config_response', 'zone_assignment', 'subzone_assignment', 'sensor_health',
        'device_scope_changed', 'device_context_changed',
        'device_discovered', 'device_approved', 'device_rejected', 'device_rediscovered',
        'actuator_response', 'actuator_command', 'actuator_command_failed',
        'config_published', 'config_failed',
        'sequence_started', 'sequence_step', 'sequence_completed', 'sequence_error', 'sequence_cancelled',
        'logic_execution',
        'notification', 'error_event', 'system_event',
      ] as MessageType[],
```

**Zone-Payload ohne `reason_code` (IST):**

```28:39:El Frontend/src/shared/stores/zone.store.ts
interface ZoneAssignmentPayload {
  esp_id?: string
  device_id?: string
  status: 'zone_assigned' | 'zone_removed' | 'error'
  zone_id?: string | null
  zone_name?: string | null
  master_zone_id?: string | null
  kaiser_id?: string | null
  timestamp?: number
  message?: string
}
```

**Server: Spread von `runtime_telemetry` in WS-Payload (normativ):**

```229:231:El Servador/god_kaiser_server/src/services/event_contract_serializers.py
    if runtime_telemetry:
        for key, value in runtime_telemetry.items():
            payload[key] = value
```

---

**Ende Auftrag.** Umsetzung in der Reihenfolge **P0-A → P0-B → P0-C → P0-D** empfohlen (A zuerst, damit alle folgenden Events den Subscription-Pfad sicher passieren).
