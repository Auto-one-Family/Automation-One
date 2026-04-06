# Frontend-Gesamtbericht: Contract April 2026 (IST, Lücken, Zentralisierungsplan)

**Datum:** 2026-04-05  
**Repo:** AutomationOne  
**Schwerpunkt:** `El Frontend/`  
**Normative Server-Referenz:** `El Servador/god_kaiser_server/docs/FIRMWARE_CONTRACT_SERVER_2026-04-05.md` + Code (`serialize_esp_health_event`, `intent_outcome_*_handler`, `event_contract_serializers.py`)  
**Erweiterte Event-Doku:** `.claude/reference/api/WEBSOCKET_EVENTS.md` (Version 2026-04-05)

---

## Executive Summary

Das Frontend ist für **terminale** Actuator-/Config-/Sequence-Intents über `actuator.store.ts` und `contractEventMapper.ts` bereits relativ contract-nah aufgestellt (Korrelation, keine heuristische Terminalität beim Timeout). **Kritische Lücken** betreffen die neuen/kanonischen Server-Signale **April 2026**:

1. **`intent_outcome` und `intent_outcome_lifecycle` werden im gesamten `El Frontend/src` nicht referenziert** (kein Handler, kein Filter, kein API-Client-Nutz im UI) — vollständige Abwesenheit der kanonischen Intent-Outcome-Pipeline neben Actuator/Config/Sequence.
2. **`esp_health`-Payload wird nicht als Domain-Objekt normalisiert:** Laufzeit-Telemetrie/Degradations-Flags werden vom Server per **Top-Level-Spread** aus `runtime_telemetry` in die WS-Payload gemischt (`serialize_esp_health_event`), im Store aber **nicht** auf `ESPDevice` gemappt; sichtbar ist faktisch vor allem **online/offline + Heap/RSSI/Uptime + GPIO**.
3. **Zone/Subzone-ACK:** `reason_code` ist in `zone.store.ts` **weder typisiert noch in Toasts/Logs** ausgewiesen; Erfolgsfälle zeigen generische Texte.
4. **WebSocket-Filter in `esp.ts`:** Registrierte Handler für u. a. `notification_new`, `notification_updated`, `notification_unread_count`, `sensor_config_deleted`, `actuator_config_deleted` stehen **nicht** in `filters.types` — bei aktivem Subscription-Pfad werden diese Events **clientseitig nicht** an die `useWebSocket`-Handler durchgereicht (siehe technische Analyse unten). Das ist ein **P0-Integrationsrisiko** für Inbox und Ghost-Cleanup.

---

## 1. View-Inventar mit Domänen-Zuordnung

| View (`src/views/`) | Primäre Domänen |
|---------------------|-----------------|
| `HardwareView.vue` | ESP-Gerät, Zone/Subzone-UI, Sensor/Aktor-Config (L1–L3), GPIO, Mock vs. Real |
| `MonitorView.vue` | Sensor/Aktor-Live, Dashboard-Widgets, Zeitreihen |
| `CustomDashboardView.vue` | Dashboard/Widgets, Chart-Daten (normalisierte Series erwünscht) |
| `SystemMonitorView.vue` | Aggregierte Events, Contract-Validierung (`validateContractEvent`), MQTT-Tab, Health/DB/Logs |
| `LogicView.vue` | Regeln, `logic_execution` (über `logic.store`) |
| `SensorsView.vue` | Komponenten-Wissensdatenbank (kein SensorConfigPanel) |
| `SettingsView.vue`, `UserManagementView.vue`, `LoginView.vue`, `SetupView.vue` | Auth, Benutzer, Setup |
| `CalibrationView.vue` | Kalibrierung |
| `PluginsView.vue` | Plugins / AutoOps |
| `MaintenanceView.vue` | Redirect → System Monitor Health |
| `SystemConfigView.vue`, `LoadTestView.vue` | Admin-Konfiguration, Lasttests |
| `EmailPostfachView.vue` | E-Mail-Integration |

**Router:** `/dashboard-legacy` redirectet nach `/hardware` (Legacy nicht anbinden, Auftrag erfüllt).

---

## 2. Store-Inventar und Mutationsquellen

| Store | Pfad | REST | WebSocket | Persistenz / Sonstiges |
|-------|------|------|-----------|-------------------------|
| `esp` | `src/stores/esp.ts` | `espApi`, `sensorsApi`, `actuatorsApi`, `debugApi` | Zentraler Dispatcher (`initWebSocket`) | devices, pendingDevices |
| `actuator` | `src/shared/stores/actuator.store.ts` | indirekt über esp | actuator_*, sequence_*, config_published/failed (Teil) | Intent-Map im Speicher |
| `config` | `src/shared/stores/config.store.ts` | — | config_response, (config_published/failed via esp → config) | — |
| `sensor` | `src/shared/stores/sensor.store.ts` | — | sensor_data, sensor_health | — |
| `zone` | `src/shared/stores/zone.store.ts` | `zonesApi` | zone_assignment, subzone_assignment, device_scope/context | zoneEntities |
| `gpio` | `src/shared/stores/gpio.store.ts` | API refresh | esp_health (gpio_status) | — |
| `deviceContext` | `src/shared/stores/deviceContext.store.ts` | device-context API | device_context_changed | — |
| `logic` | `src/shared/stores/logic.store.ts` | logic API | logic_execution (eigene Subscription) | localStorage/Rule-Flow |
| `notification` | `src/shared/stores/notification.store.ts` | — | notification, error_event, system_event | — |
| `notification-inbox` | `src/shared/stores/notification-inbox.store.ts` | notifications API | **soll** notification_new/updated/unread_count (siehe Filter-Bug) | — |
| `dashboard` | `src/shared/stores/dashboard.store.ts` | dashboards API | — | localStorage |
| `diagnostics`, `database`, `plugins`, `auth`, `ui`, `inventory`, `alert-center`, `quickAction`, `dragState` | diverse | je nach Store | teils | teils |

**Kein** dedizierter Store für **kanonische Intent-Outcomes** (`intent_outcome` / REST `/v1/intent-outcomes`).

---

## 3. API-Clients (`src/api/**`)

Relevant für Contract: `esp.ts`, `actuators.ts`, `sensors.ts`, `zones.ts`, `subzones.ts`, `device-context.ts`, `audit.ts`, `health.ts`, `debug.ts`, `notifications.ts`, `diagnostics.ts`, `logic.ts`, `config.ts`, `errors.ts`, `dashboards.ts`, …

**Feststellung:** Es gibt **keinen** Frontend-API-Client für **`/v1/intent-outcomes`** (kein Treffer unter `El Frontend` zu `intent-outcomes` / `intent_outcome`).

---

## 4. WebSocket: technische Zusatz-Analyse (Filter vs. Listener)

- `websocketService.handleMessage` ruft **`routeMessage`** (nur Subscriptions mit `matchesFilters`) **und** **`listeners.get(message.type)`** (alle Events dieses Typs) auf.
- `useWebSocket`: Sobald eine **Subscription** mit `filters.types` aktiv ist, registriert `on()` **kein** globales `websocketService.on`, sondern nur lokale `messageHandlers`; diese werden **nur** vom **Subscription-Callback** aufgerufen, der wiederum **nur gefilterte** Messages sieht.

**Konsequenz für `esp.ts`:** Die `filters.types`-Liste (Zeilen ~134–144) muss **alle** Event-Typen enthalten, für die Handler über **dieselbe** `useWebSocket`-Instanz laufen. Fehlend (Stand Analyse): u. a. **`notification_new`, `notification_updated`, `notification_unread_count`, `sensor_config_deleted`, `actuator_config_deleted`** — obwohl `ws.on(...)` dafür registriert ist.

---

## 5. WebSocket-Event-Matrix (Server → Frontend)

Legende: **Handler** = führt zu Store/UI-Update; **—** = kein dedizierter Handler / nicht in Filter / nur indirekt.

| Server-Event (`type`) | Frontend-Handler (primär) | Zielmodell (SOLL) | IST / Bemerkung |
|----------------------|---------------------------|-------------------|-----------------|
| `sensor_data` | `esp.ts` → `sensor.store` | Normalisierter Sensor-Punkt | OK; `raw_value` vs. `processed_value` in Charts prüfen |
| `sensor_health` | `esp.ts` → `sensor.store` | Sensor-Gesundheit | OK |
| `sensor_config_deleted` | `esp.ts` | Device.sensors bereinigen | **Gefiltert:** nicht in `esp` filters.types → ggf. **nie** im Subscription-Pfad |
| `actuator_status` | `actuator.store` | Aktor-State | OK |
| `actuator_response` | `actuator.store` | Terminal Intent | Contract-validate |
| `actuator_alert` | `actuator.store` | Emergency-Flags | OK |
| `actuator_command` / `actuator_command_failed` | `actuator.store` | Pending / Terminal | Timeout = non-terminal Hint (konform Anforderung) |
| `esp_health` | `esp.ts`, `gpio.store` | ESP-Gesundheit + Telemetrie | **Telemetrie/Flags nicht als Domain** auf Device; nur Teilfelder |
| `esp_reconnect_phase` | — | Reconnect-Phase | **Nicht implementiert** |
| `esp_diagnostics` | — | Diagnose-Snapshot | **Nicht implementiert** |
| `config_response` | `config.store` + `actuator.store` | Config-Intent terminal | OK |
| `config_published` / `config_failed` | `config.store` + `actuator.store` | Config-Intent | OK |
| **`intent_outcome`** | — | Kanonischer Outcome | **Komplett fehlend** |
| **`intent_outcome_lifecycle`** | — | CONFIG_PENDING-Lifecycle | **Komplett fehlend** |
| `zone_assignment` | `zone.store` | Zone auf Device | **ohne `reason_code`-UI** |
| `subzone_assignment` | `zone.store` + refresh | Subzone | **ohne `reason_code`-UI**; Label in `eventTypeLabels` fehlt |
| `device_context_changed` / `device_scope_changed` | `zone.store` + `deviceContext` + `fetchAll` | Kontext | OK mit REST-Refresh |
| `device_discovered` / `device_rediscovered` / `device_approved` / `device_rejected` | `esp.ts` | Pending/Devices | OK |
| `logic_execution` | `logic.store` (eigene WS) + Filter in esp | Regel-Audit | Zwei Pfade |
| `notification` | `notification.store` | Legacy Toast | Deprecated Server-seitig |
| `notification_new` / `notification_updated` / `notification_unread_count` | `notification-inbox.store` | Inbox | **Gefiltert:** nicht in esp filters |
| `error_event` / `system_event` | `notification.store` | Fehler/System | OK |
| `sequence_*` | `actuator.store` | Sequence-Intent | OK |
| `plugin_execution_started` / `plugin_execution_completed` | — | Plugin-Lauf | **Nicht implementiert** |
| `events_restored` | eher Aggregator | Audit | Nur falls API liefert |
| `contract_mismatch` / `contract_unknown_event` | System Monitor / Transformer | Integrität | Intern generiert / angezeigt |

---

## 6. Domänen-Antworten (Auftragsfragen 6.1–6.5)

### 6.1 Intent Outcome + Lifecycle

- **Nur terminales Outcome?** Für **Actuator/Config/Sequence** ja, über `actuator.store` und WS-Terminal-Events. **`intent_outcome` / Lifecycle:** nein, **gar nicht angebunden**.
- **Verschachtelte Daten / merge auf Server:** Keine Darstellung, da kein Consumer.
- **Bekannter Flow + unbekannter Outcome + Firmware-code:** Nicht abbildbar ohne `intent_outcome`-Ingest.
- **State-Maschine:** Eine Implementierung für **actuator/config/sequence** in `actuator.store`; **keine** für MQTT-Intent-Outcomes.
- **Idempotenz:** Duplikate terminaler Events werden ignoriert (`isIntentTerminal`); Lifecycle fehlt.

### 6.2 ESP-Gesundheit und Heartbeat-Telemetrie

- **`esp_health`:** `esp.ts` `handleEspHealth` aktualisiert u. a. uptime, heap, rssi, status, GPIO via `gpio.store`.
- **`runtime_telemetry`:** Server splittet JSON in **Top-Level-Felder** der WS-Payload; Frontend speichert sie **nicht** strukturiert auf `ESPDevice` → **kein** Debug-Panel für persistence/runtime/network/circuit-breaker-Zähler.
- **Degradations-Flags:** Keine einheitliche Badge-/Severity-Ableitung aus `persistence_degraded` / `network_degraded` / CB-Flags; `inferFallbackSeverity` für `esp_health` nutzt praktisch nur `status` (offline/timeout).
- **Nur Heap/RSSI:** Hardware-UI (z. B. `ESPCard.vue`, `ESPHealthWidget`) fokussiert klassische Metriken — **Deckungslücke** zu April-2026-Semantik.

### 6.3 Zone / Subzone und ACK

- **Darstellung:** Toasts + Device-Felder in `zone.store`; `ZoneAssignmentPanel` dokumentiert WS-Flow.
- **`reason_code`:** In Payload-Typen **nicht** enthalten; UI zeigt bei Fehler nur `message`, bei Erfolg keine Bridge-Gründe.
- **REST vs. WS:** Subzone triggert `fetchAll()` nach success; Zone aktualisiert selektiv — insgesamt konservativ.

### 6.4 Zeit und Einheiten

- **`esp.ts`:** Explizite Heuristik: `timestamp > 1e10` → ms, sonst Sekunden — **kompatibel** mit gemischten Quellen; Kommentar erwähnt „Unix ms“ für Heartbeat (Server sendet laut Doku **Sekunden** — Heuristik fängt Altlasten ab).
- **Actuator:** `last_command_at` aus `data.timestamp * 1000` (Sekunden angenommen).
- **Charts:** Prüfpunkt für Series aus REST (Sensor-Historie), ob Achsen **ms vs. s** einheitlich sind — nicht vollständig im Bericht enumeriert; **Drift-Risiko** bleibt für neue Telemetrie-Felder mit `ts`.

### 6.5 System-Monitor / Observability

- **Prometheus-Metriken** (`intent_outcome_lifecycle_total`, `mqtt_ack_reason_code_total`, …): Keine UI-Verdrahtung identifiziert; **bewusst out-of-scope** solange kein Monitor-Panel definiert — im **SOLL** optional Debug-Modus.

---

## 7. Drift-Risiken (Kurzliste)

| Risiko | Beispiel / Ort |
|--------|----------------|
| Unbekannte WS-Typen | `intent_outcome_lifecycle` → `contract_unknown_event` im System Monitor, wenn validiert |
| `reason_code` vs. Intent-`code` | Zone-ACK vs. `intent_outcome.code` — aktuell nicht getrennt kommuniziert |
| Gesundheit vs. Offline | `esp_health` offline vs. Degradation „online aber eingeschränkt“ |
| Filter vs. Handler | `esp.ts` types-Liste vs. `ws.on` — **P0** |
| Typ-Doku vs. Realität | `websocket-events.ts` `ESPHealthEvent` (veraltet, gpio als Record) vs. Server-Array |
| `MessageType` Union | Fehlt `notification_*`, `intent_outcome*`, `esp_reconnect_phase`, … |

---

## 8. Zentralisierungsplan (≥10 konkrete Ziele)

| # | IST (doppelt / zerstreut) | SOLL: Modul `M` | Export-API (Vorschlag) |
|---|---------------------------|-----------------|-------------------------|
| 1 | WS-Rohdaten in Stores/Views | `src/domain/ws/adapters.ts` | `toWebSocketEnvelope(raw)`, `adaptEspHealthData`, `adaptIntentOutcome` |
| 2 | Severity für Events | heute `contractEventMapper.inferFallbackSeverity` + UI-Sonderfälle | `deriveEventSeverity(eventType, normalized)` |
| 3 | Intent-Outcome (MQTT-kanonisch) vs. UI-Intent-Map | nur `actuator.store` | `src/domain/intent/` mit `mergeLifecycleAndTerminal`, `explainFirmwareCode` |
| 4 | Config/Actuator Terminalität | `actuator.store` + `validateContractEvent` | `src/domain/intent/actuatorConfigSequence.ts` re-exports + schlanke Store-Nutzung |
| 5 | `esp_health` Feld-Mixing (telemetry top-level) | `esp.ts` spread implizit | `normalizeEspHealthPayload(data): EspHealthViewModel` + optional `rawTelemetry: Record<string, unknown>` |
| 6 | Degradation-Badges | keine | `espHealthPresentation.ts`: `badge`, `severity`, `tooltip`, `recommendedAction` |
| 7 | Zone/Subzone ACK Texte | `zone.store` Toasts | `ackPresentation.ts`: `formatZoneAck`, `formatSubzoneAck` mit **`reason_code`** |
| 8 | Event-Labels | `eventTypeLabels` + `MqttTrafficTab` + `PreviewEventCard` | `eventLabels.ts` eine Quelle + fehlende `subzone_assignment` |
| 9 | Chart-Daten | Widgets lesen teils Roh-API | Composable `useNormalizedSeries` — **keine** MQTT-Feldnamen in Chart-Zweigen |
| 10 | WS-Contract-Liste | `contractEventMapper.WS_EVENT_TYPES` unvollständig | `contracts/wsEventRegistry.ts` aus einer generierten oder gepflegten Liste synchron zu Server |
| 11 | REST Intent-Outcomes | fehlt | `api/intentOutcomes.ts` + Store- oder Query-Cache |
| 12 | System Monitor Validierung | `validateContractEvent` kennt neue Typen nicht | Registry erweitern oder Validierung pro Quelle |

**Migrationsschritte (pro Modul):** Adapter implementieren → Stores nur noch View-Models konsumieren → Komponenten auf Composables umstellen → Tests anpassen.

---

## 9. P0-Block (Operator-Irritationen)

1. **`intent_outcome` + `intent_outcome_lifecycle` nicht angebunden** — falsche oder fehlende Sicht auf reale Firmware-/Server-Wahrheit; Pending-Zustände ohne Lifecycle-Erklärung.
2. **`esp.ts` WebSocket-Filter** — Events ohne Eintrag in `filters.types` erreichen registrierte Handler im Subscription-Pfad nicht → **Inbox / Config-Delete-WS** potenziell tot.
3. **Degradations-Flags unsichtbar** — Gerät wirkt „gesund“ (Heap/RSSI), während Server **warning** aggregiert.
4. **`reason_code` bei ACKs unsichtbar** — Diagnose erschwert, Verwechslung mit Intent-Fehlercodes möglich.

---

## 10. Priorisiertes Backlog (Akzeptanzkriterien)

### P0

| Paket | Inhalt | Akzeptanzkriterien |
|-------|--------|-------------------|
| P0-A | WS-Filter synchronisieren | Alle in `initWebSocket` registrierten `ws.on`-Typen ∈ `filters.types`; manuell: `notification_*`, `sensor_config_deleted`, `actuator_config_deleted`, nach Implementierung `intent_outcome*`, `esp_reconnect_phase` optional |
| P0-B | `intent_outcome_lifecycle` + `intent_outcome` | Handler + Typen + Anzeige im System Monitor / Device-Detail; Trennung Lifecycle vs. Terminal; REST-Parität optional |
| P0-C | ESP-Gesundheit | `normalizeEspHealthPayload`; Anzeige mindestens **eines** Panels für Degradation + unknown telemetry keys (eingeklappt) |
| P0-D | ACK `reason_code` | Zone/Subzone: Toast/Detail mit **„Brückengrund (ACK): …“** getrennt von Intent-Codes |

### P1

| Paket | Inhalt | Akzeptanzkriterien |
|-------|--------|-------------------|
| P1-A | Domain-Adapter-Schicht | Kein direktes `message.data as any` in neuen Features; bestehende Stores schrittweise migrieren |
| P1-B | `contractEventMapper` / `WS_EVENT_TYPES` | Vollständigkeit vs. Server 41+ Events; `subzone_assignment` Labels |
| P1-C | `esp_reconnect_phase` | Kein Flackern in HardwareView; klare Phasenanzeige |

### P2

| Paket | Inhalt | Akzeptanzkriterien |
|-------|--------|-------------------|
| P2-A | Prometheus/Metriken im UI | Nur wenn Product Owner will; sonst dokumentiert out-of-scope |
| P2-B | Plugin-Execution WS | PluginsView optional anbinden |

---

## 11. Testlücken

| Bereich | IST | SOLL nach Umsetzung |
|---------|-----|---------------------|
| `intent_outcome` / Lifecycle | keine Tests | Unit: Adapter + Store; Integration: Mock-WS |
| `esp_health` Telemetrie | `eventTransformer.test.ts` Basis | Snapshot-Tests mit `persistence_degraded`, CB-Flags |
| Zone/Subzone `reason_code` | fehlt | Unit: `ackPresentation` |
| WS-Filter vs. Handler | `useWebSocket.test.ts` vorhanden | **Regression:** Event-Typ registriert aber nicht in `filters.types` |
| E2E | device-discovery mit `esp_health` | Szenario: Degradation sichtbar; optional Intent-Lifecycle |

---

## 12. Glossar (einheitliche UI-Sprache)

| Begriff | Bedeutung | UI-Bezeichnung (Vorschlag) |
|---------|-----------|----------------------------|
| **Intent** | Server-/MQTT-verfolgter Vorgang mit Korrelation | „Vorgang“ / „Aktion“ + Korrelations-ID (kurz) |
| **Lifecycle-Event** | Nicht-terminal (`intent_outcome_lifecycle`) | „Zwischenstand (Konfiguration)“ |
| **Terminal Outcome** | Abschluss (`intent_outcome` kanonisch) | „Ergebnis“ mit Outcome-Label aus Server-Enum |
| **Firmware-Code** | Hersteller-String in Outcome | „Firmware-Code“ (nicht als „Vertragsfehler“ ohne Kontext) |
| **runtime_telemetry** | JSONB aus Heartbeat-Ingest, im WS flach ausgebreitet | „Laufzeit-Details“ / „Geräte-Telemetrie“ |
| **reason_code (ACK)** | MQTT-/Bridge-Grund bei Zone/Subzone-ACK | „Brückengrund (Zone)“ / „Brückengrund (Subzone)“ — **nicht** „Fehlercode“ im Intent-Sinne |

---

## 13. Referenzen (Code)

Server merge/spread Verhalten:

```229:231:El Servador/god_kaiser_server/src/services/event_contract_serializers.py
    if runtime_telemetry:
        for key, value in runtime_telemetry.items():
            payload[key] = value
```

Frontend WS-Filter (Auszug — **Lücke** zu zusätzlichen Handlern):

```133:145:El Frontend/src/stores/esp.ts
    filters: {
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
    },
```

Zone-Payload ohne `reason_code`:

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

---

**Ende Bericht** — Umsetzung bewusst nicht Teil dieses Auftrags; Folgeaufträge nach P0-Paketen P0-A–D empfohlen.
