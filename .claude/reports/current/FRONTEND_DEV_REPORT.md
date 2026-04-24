# Frontend Dev Report: AUT-134 Config-Flow Operator-Sichtbarkeit

## Modus: A (Analyse)
## Auftrag: Read-only Analyse der operatorischen Sichtbarkeit des Config-Flows (gesendet/warum, accepted/stale/failed, wartend vs Fehler)

---

## 1. IST-Zustand: Events, Stores und Komponenten mit Config-Finalität

### 1.1 WebSocket-Events (Config-Lifecycle)

| Event | Typ | Frontend-Interface | WS-Payload-Felder (heute) |
|-------|-----|-------------------|--------------------------|
| `config_published` | non-terminal (pending) | `ConfigPublishedEvent` (`websocket-events.ts:332`) | `esp_id`, `config_keys[]`, `correlation_id?` |
| `config_response` | terminal | `ConfigResponseEvent` (`websocket-events.ts:118`) | `esp_id`, `status`, `error_code?`, `message?`, `correlation_id` (pflicht), `request_id?` |
| `config_response_guard_replay` | terminal (replay) | kein eigenes Interface, re-uses `config_response` shape | identisch + `correlation_id_source` |
| `config_failed` | terminal | `ConfigFailedEvent` (`websocket-events.ts:347`) | `esp_id`, `config_keys[]`, `error`, `correlation_id` (pflicht), `request_id?` |

### 1.2 Stores mit Config-Lifecycle-Logik

| Store | Pfad | Rolle im Config-Flow |
|-------|------|---------------------|
| **actuator.store** | `shared/stores/actuator.store.ts` | **Primärer Intent-Tracker:** `IntentRecord` mit `intentType='config'`, `FinalityState`, `correlationId`, `requestId`, `terminalSource`. Timeouts (`CONFIG_RESPONSE_TIMEOUT_MS=75s`, offline_rules=120s). Handler: `handleConfigPublished`, `handleConfigResponse`, `handleConfigResponseGuardReplay`, `handleConfigFailed`. |
| **config.store** | `shared/stores/config.store.ts` | **Toast-Emitter:** `handleConfigResponse` (success/partial/error Toasts mit `deviceName`, `failures[]`), `handleConfigPublished` (Info-Toast mit `config_keys`), `handleConfigFailed` (persistenter Error-Toast). |
| **esp.store** | `stores/esp.ts` | **WS-Dispatcher:** Registriert `ws.on('config_response', ...)` etc., delegiert an `actuatorStore` (Intent) + `configStore` (Toast). |

### 1.3 Komponenten mit Config-Sichtbarkeit

| Komponente | Pfad | Config-Bezogene UI |
|------------|------|-------------------|
| **PendingConfigBanner** | `components/esp/PendingConfigBanner.vue` | Inline-Banner für pending/accepted/timeout Config-Intents. Zeigt: Spinner (pending), Warning-Icon (timeout), `correlation_id` (gekürzt), Elapsed-Timer, Retry-Button, Deep-Link zu SystemMonitor/Events. |
| **SensorConfigPanel** | `components/esp/SensorConfigPanel.vue:360-475` | REST-Submit → `registerConfigIntentFromRest()` → `waitForConfigTerminal(65s)` → Toast-Kaskade (accepted → success / timeout / failed). Zeigt `lastConfigSubjectId` + `lastConfigCorrelationId` an `PendingConfigBanner`. |
| **ActuatorConfigPanel** | `components/esp/ActuatorConfigPanel.vue:340-436` | Identisches Pattern wie SensorConfigPanel. |
| **EventDetailsPanel** | `components/system-monitor/EventDetailsPanel.vue` | Zeigt `config_response`/`config_failed` in Event-Detail mit `correlation_id`. |
| **NotificationItem** | `components/notifications/NotificationItem.vue` | Zeigt `correlation_id` im Detail-Block + Deep-Link "Im Event-Monitor prüfen". |
| **MqttTrafficTab** | `components/system-monitor/MqttTrafficTab.vue:73-87` | Filtert/labelt `config_response` in MQTT-Traffic-Ansicht. |

### 1.4 Typ-Definitionen mit Config-Status

| Typ | Pfad | Felder |
|-----|------|--------|
| `MockSensor.config_status` | `types/index.ts:276` | `'pending' \| 'applied' \| 'failed' \| null` |
| `MockActuator.config_status` | `types/index.ts:321` | identisch |
| `SensorConfigResponse.config_status` | `types/index.ts:738` | identisch |
| `ActuatorConfigResponse.config_status` | `types/index.ts:952` | identisch |
| `ConfigResponse` | `types/index.ts:972` | `esp_id, config_type, status, count, message, error_code?, timestamp` |
| `ConfigResponseExtended` | `types/index.ts:996` | + `failed_count?, failures[], error_description?, failed_item?` |
| `IntentRecord` (actuator.store intern) | `actuator.store.ts:68-86` | `intentType, subjectId, state, correlationId, requestId, terminalSource, nonTerminalHints[], summary` |

---

## 2. Lücken für AUT-134

### 2.1 `reason_code` — Warum wurde gesendet / warum Fehler

| Wo fehlt es | Detail | Server-Evidenz |
|-------------|--------|----------------|
| **`ConfigResponseEvent`** (`websocket-events.ts:118`) | Kein `reason_code`-Feld im Interface | Server `config_handler.py:154-155` speichert `canonical.code` + `canonical.reason` in DB, sendet aber **nicht** zum WS-Frontend (Serializer `serialize_config_response_event` hat keinen `reason`/`reason_code`-Parameter). |
| **`ConfigPublishedEvent`** (`websocket-events.ts:332`) | Kein `reason_code` für "warum gesendet" | Server `esp_service.py:634-641` sendet `config_keys`, `queued`, `device_status`, aber **keinen** Auslöser-Grund. |
| **`ConfigFailedEvent`** (`websocket-events.ts:347`) | `error`-String vorhanden, aber kein strukturierter `reason_code` | Server `esp_service.py:697-703` sendet `error: "MQTT publish failed"` als Freitext. |
| **`IntentRecord`** (`actuator.store.ts:68-86`) | Kein `reason_code`-Feld | Intern ist `terminalSource` vorhanden (z.B. `config_response`, `config_failed`), aber kein semantischer Grund-Code. |
| **PendingConfigBanner** | Zeigt nur "Warte auf Geräte-Rückmeldung" — kein Grund warum Config gesendet wurde | — |
| **config.store Toast-Texte** | `"Konfiguration für {device} gesendet (sensors, actuators)"` — keine Motivation sichtbar | — |

### 2.2 `generation` — Config-Versionierung / Stale-Erkennung

| Wo fehlt es | Detail | Server-Evidenz |
|-------------|--------|----------------|
| **`ConfigResponseEvent`** | Kein `generation`-Feld | Server `config_handler.py:157` liest `payload.get("generation")` aus ESP-Payload, speichert in `CommandContractRepository`, aber **sendet nicht** via WS zum Frontend. |
| **Frontend-Types** | Kein `generation`-Feld in `ConfigResponse`, `ConfigResponseExtended`, `ConfigResponseEvent` | — |
| **actuator.store** | `IntentRecord` hat kein `generation`-Feld | Intent-Tracking ist rein `correlation_id`-basiert ohne Versionsbezug. |
| **Stale-Erkennung** | Server macht Stale-Detection via Terminal Authority Guard (`was_stale` in `config_handler.py:162`), sendet aber `config_response_guard_replay` ohne `generation`-Info ans Frontend. | Frontend sieht nie "dieses Config-ACK war für eine ältere Generation". |

### 2.3 `fingerprint` — Config-Inhaltshash

| Wo fehlt es | Detail |
|-------------|--------|
| **Gesamter Config-Flow** | `fingerprint` existiert im Frontend nur im Notification-Kontext (`notification-inbox.store.ts:304`, `api/notifications.ts:54`). Config-Events haben **keinen** Inhaltshash. |
| **Server-Seite** | `config_handler.py` und `esp_service.py` verwenden kein Config-Fingerprinting. `fingerprint` wird nur für Notification-Dedup (`notification_router.py`) und Sensor-Health-Jobs verwendet. |

### 2.4 `correlation_id`-Sichtbarkeit — Heute vs. AUT-134

| Aspekt | IST | SOLL (AUT-134) |
|--------|-----|----------------|
| `correlation_id` in Config-Panels | ✅ PendingConfigBanner zeigt gekürzte ID | Ausreichend |
| `correlation_id` in Toasts | ✅ Suffix `(Korrelation: xxx \| Request-ID: yyy)` | Ausreichend |
| `correlation_id` in Event-Monitor | ✅ EventDetailsPanel, correlation_id-Filter | Ausreichend |
| **Config-Auslöser** (warum wurde gesendet) | ❌ Nicht sichtbar | Operator braucht: "User-Config-Save", "Reconnect-Push", "Rule-triggered" |
| **Config-Endzustand** (warum Fehler) | ❌ Nur Freitext-Error, kein strukturierter Code | Operator braucht: `CONFIG_PARSE_FAILED`, `GPIO_CONFLICT`, `TIMEOUT` etc. |
| **Staleness** (dieses ACK war veraltet) | ❌ Nicht sichtbar | Operator braucht: "Antwort war für ältere Config-Version" |

---

## 3. Minimale UI/Store-Erweiterung (Pattern-konform)

### 3.1 Type-Erweiterungen (`types/websocket-events.ts`, `types/index.ts`)

**a) `ConfigResponseEvent` erweitern:**
```typescript
// websocket-events.ts:118 — ConfigResponseEvent.data
reason_code?: string       // "CONFIG_APPLIED" | "CONFIG_PARSE_FAILED" | "GPIO_CONFLICT" etc.
reason_text?: string       // Menschenlesbare Beschreibung
generation?: number        // Config-Versionsgeneration (Monoton, ESP-seitig)
config_fingerprint?: string // SHA256-Kurzform des Config-Inhalts
```

**b) `ConfigPublishedEvent` erweitern:**
```typescript
// websocket-events.ts:332 — ConfigPublishedEvent.data
trigger_source?: string    // "user_save" | "reconnect_push" | "rule_trigger" | "maintenance"
generation?: number
config_fingerprint?: string
```

**c) `ConfigFailedEvent` erweitern:**
```typescript
// websocket-events.ts:347 — ConfigFailedEvent.data
reason_code?: string       // "MQTT_PUBLISH_FAILED" | "BROKER_OFFLINE" | "DEVICE_UNREACHABLE"
```

**d) `IntentRecord` im actuator.store:**
```typescript
// actuator.store.ts IntentRecord
reasonCode?: string
reasonText?: string
generation?: number
configFingerprint?: string
triggerSource?: string     // nur config-intents
```

### 3.2 Store-Erweiterungen

**Pattern:** Identisch zu bestehender `handleConfigPublished`/`handleConfigResponse`-Logik.

**a) `actuator.store.ts` — Felder in `createOrUpdateIntentPending` / `finalizeIntent` durchreichen:**
- `handleConfigPublished`: `data.trigger_source`, `data.generation`, `data.config_fingerprint` extrahieren → in `nonTerminalHints` oder dedizierte Felder speichern.
- `handleConfigResponse`: `data.reason_code`, `data.reason_text`, `data.generation`, `data.config_fingerprint` → in finalized Intent speichern.
- `handleConfigFailed`: `data.reason_code` → in finalized Intent.

**b) `config.store.ts` — Toast-Texte anreichern:**
- `handleConfigPublished`: `trigger_source` in Toast einbauen: `"Konfiguration für {device} gesendet (Auslöser: User-Speicherung) — sensors, actuators"`
- `handleConfigResponse`: `reason_code` im Error-Fall: `"${deviceName}: ${reason_code} — ${reason_text || message}"`
- `handleConfigFailed`: `reason_code` statt Freitext-`error`.

### 3.3 UI-Erweiterungen (bestehende Komponenten)

**a) `PendingConfigBanner.vue` — Erweiterung:**
- Zeige `trigger_source` als Tag/Badge neben dem Titel: "Konfigurationsauftrag läuft (User-Speicherung)"
- Bei `terminal_failed`: Zeige `reason_code` statt generischem "Details im Event-Monitor prüfen"
- `generation`-Badge bei Stale-Erkennung: "Veraltet (Gen. 5, aktuell: 7)"

**b) `EventDetailsPanel.vue` — Config-Detail-Sektion:**
- `reason_code` + `reason_text` als eigene Zeilen (Pattern wie `integrationIssue.correlationId`)
- `generation` anzeigen wenn vorhanden
- `config_fingerprint` als Mono-Text

**c) Keine neue Komponente nötig — PendingConfigBanner ist die SSOT für Config-Lifecycle-UI.**

### 3.4 Contract-Mapper-Erweiterung (`contractEventMapper.ts`)

**Bestehende Validierung erweitern:**
```typescript
// config_response Validierung — OPTIONAL neue Felder akzeptieren
// Kein Breaking Change: reason_code/generation sind optionale Enrichment-Felder
```

### 3.5 Labels (`utils/labels.ts` oder neues `configReasonLabels.ts`)

```typescript
export const CONFIG_REASON_LABELS: Record<string, string> = {
  CONFIG_APPLIED: 'Konfiguration übernommen',
  CONFIG_PARSE_FAILED: 'Konfigurations-Parsing fehlgeschlagen',
  GPIO_CONFLICT: 'GPIO-Konflikt',
  TIMEOUT: 'Zeitüberschreitung',
  MQTT_PUBLISH_FAILED: 'MQTT-Versand fehlgeschlagen',
  BROKER_OFFLINE: 'Broker nicht erreichbar',
  DEVICE_UNREACHABLE: 'Gerät nicht erreichbar',
}

export const CONFIG_TRIGGER_LABELS: Record<string, string> = {
  user_save: 'Manuelle Speicherung',
  reconnect_push: 'Reconnect-Push',
  rule_trigger: 'Automationsregel',
  maintenance: 'Wartung',
}
```

---

## 4. Tests (Unit/E2E) mit konkreten Dateipfaden

### 4.1 Unit-Tests (Vitest)

| Test-Datei (bestehend/neu) | Was testen | Assertions |
|----------------------------|-----------|------------|
| **`tests/unit/stores/actuator.store.test.ts`** (existiert: `El Frontend/tests/unit/stores/actuator.store.test.ts`) | `handleConfigPublished` mit `trigger_source`, `generation`, `config_fingerprint` → Intent hat neue Felder | `expect(intent.triggerSource).toBe('user_save')`, `expect(intent.generation).toBe(5)` |
| **`tests/unit/stores/actuator.store.test.ts`** | `handleConfigResponse` mit `reason_code`, `generation` → Finalized Intent hat `reasonCode` | `expect(intent.reasonCode).toBe('CONFIG_APPLIED')`, `expect(intent.state).toBe('terminal_success')` |
| **`tests/unit/stores/actuator.store.test.ts`** | `handleConfigFailed` mit `reason_code` → Finalized Intent hat `reasonCode` | `expect(intent.reasonCode).toBe('MQTT_PUBLISH_FAILED')` |
| **`tests/unit/stores/actuator.store.test.ts`** | Config-Intent ohne `reason_code` (Rückwärtskompatibilität) → `reasonCode` ist `undefined`, kein Crash | `expect(intent.reasonCode).toBeUndefined()` |
| **`tests/unit/utils/configReasonLabels.test.ts`** (neu) | Label-Mapping Vollständigkeit | Alle Keys in `CONFIG_REASON_LABELS` haben nicht-leere Strings |
| **`tests/unit/components/PendingConfigBanner.test.ts`** (neu) | Banner zeigt `trigger_source` Label | Mount mit Props `subjectId` + gemocktem Intent mit `triggerSource` → Text enthält "Manuelle Speicherung" |
| **`tests/unit/components/PendingConfigBanner.test.ts`** | Banner zeigt `reason_code` bei terminal_failed | Mock Intent `state='terminal_failed'` + `reasonCode='GPIO_CONFLICT'` → Text enthält "GPIO-Konflikt" |

### 4.2 E2E-Tests (Playwright)

| Test-Datei (neu) | Was testen |
|-----------------|-----------|
| **`tests/e2e/scenarios/aut-134-config-flow-visibility.spec.ts`** | 1) SensorConfigPanel: Config speichern → PendingConfigBanner visible mit Spinner + Korrelation<br>2) Mock WS `config_response` mit `reason_code` → Banner verschwindet, Success-Toast enthält Reason<br>3) Mock WS `config_failed` mit `reason_code` → Persistent Error-Toast enthält strukturierten Grund<br>4) Mock WS `config_published` mit `trigger_source` → Info-Toast enthält "Auslöser: ..." |

---

## Cross-Layer Impact

| Frontend-Änderung | Abhängigkeit | Zuständig |
|--------------------|-------------|-----------|
| Neue optionale Felder in WS-Event-Interfaces | **Server muss `reason_code`, `generation`, `config_fingerprint`, `trigger_source` in WS-Broadcast senden** | server-dev |
| `serialize_config_response_event()` erweitern | `El Servador/.../event_contract_serializers.py:74` | server-dev |
| `config_published` Broadcast in `esp_service.py:634` erweitern | `trigger_source` hinzufügen | server-dev |
| `config_handler.py` → WS-Broadcast mit `reason`/`generation` anreichern | Daten existieren bereits in `canonical.*` und `payload.get("generation")` — nur Durchreichung fehlt | server-dev |
| ESP32-Firmware `generation`-Feld in Config-ACK | Prüfen ob `payload.generation` schon gesetzt wird | esp32-dev |

## Empfehlung

1. **Server-dev zuerst:** Serializer + Broadcasts um die fehlenden Felder erweitern (Daten existieren bereits intern).
2. **Frontend-dev danach:** Type-Interfaces erweitern → actuator.store Felder durchreichen → config.store Toasts anreichern → PendingConfigBanner erweitern → Labels → Tests.
3. **Keine Parallel-UI nötig:** PendingConfigBanner + EventDetailsPanel + Toast-Kaskade decken alle Operator-Oberflächen ab.
