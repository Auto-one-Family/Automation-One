# Phase 3 Code-Review Bericht: Error Intelligence

**Datum:** 2026-01-28
**Reviewer:** QA Engineer (KI-Agent)
**Scope:** Server error_handler, error_schemas, errors API; Frontend websocket-events, errors API client, esp.ts handler, TroubleshootingPanel, ErrorDetailsModal, App.vue, EventDetailsPanel

---

## Zusammenfassung

| Bereich | Status | Kritische Issues |
|---------|--------|------------------|
| error_handler.py Payload | ✅ | Keine |
| error_schemas.py Schema | ✅ | Keine |
| errors.py API Endpoints | ✅ | Keine |
| websocket-events.ts Types | ✅ | Keine |
| errors.ts API Client | ✅ | Keine |
| handleErrorEvent Handler | ✅ | Keine |
| TroubleshootingPanel.vue | ✅ | Keine |
| ErrorDetailsModal.vue | ✅ | Keine |
| App.vue Integration | ✅ | Keine |
| EventDetailsPanel.vue | ✅ | Keine |
| Critical Severity Styling | ✅ | Keine |
| End-to-End Flow | ✅ | Keine |

**Gesamtbewertung: Phase 3 ist VOLLSTÄNDIG und KORREKT implementiert.**

---

## Phase 1: Server-Änderungen

### 1.1 error_handler.py - WebSocket Payload

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py`

**Broadcast-Funktion:** `handle_error_event` Methode, Zeile 197-223

**WebSocket Payload-Struktur (Zeile 198-222):**
```python
{
    "esp_id": esp_id_str,
    "esp_name": esp_device.name or esp_id_str,
    "error_log_id": str(error_log.id),
    "error_code": error_code_int,
    "severity": severity,                     # mapped: "info"/"warning"/"error"/"critical"
    "category": payload.get("category"),
    "title": error_title,                     # ✅ NEU - from message_de or fallback
    "message": error_description,
    "troubleshooting": [...],                 # ✅ from esp32_error_mapping
    "user_action_required": bool,             # ✅ from esp32_error_mapping
    "recoverable": bool,                      # ✅ from esp32_error_mapping
    "docs_link": str|None,                    # ✅ NEU - from esp32_error_mapping
    "context": dict,
    "timestamp": unix_ts,
}
```

| Feld | Vorhanden | Zeile | Woher kommt der Wert? |
|------|-----------|-------|----------------------|
| title | ✅ Ja | 191-195, 206 | `error_info.get("message_de")` via `esp32_error_mapping.get_error_info()` |
| docs_link | ✅ Ja | 217-219 | `error_info.get("docs_link")` via `esp32_error_mapping.get_error_info()` |
| troubleshooting | ✅ Ja | 208-210 | `error_info["troubleshooting"]` (Zeile 209) |
| user_action_required | ✅ Ja | 211-213 | `error_info["user_action_required"]` |
| recoverable | ✅ Ja | 214-216 | `error_info["recoverable"]` |

**Imports:** `from ...core.esp32_error_mapping import get_error_info` (Zeile 34) ✅

**Fallback für unbekannte Error-Codes:**
- `error_info = get_error_info(error_code_int)` kann `None` zurückgeben (Zeile 138)
- Title-Fallback: `f"Fehler {error_code_int}"` (Zeile 194) ✅
- troubleshooting-Fallback: `[]` (Zeile 163, 209) ✅
- docs_link-Fallback: `None` (Zeile 165, 218) ✅
- user_action_required-Fallback: `False` (Zeile 167, 212) ✅
- recoverable-Fallback: `True` (Zeile 169, 215) ✅

**Bewertung:** ✅ Vollständig, robust, mit korrekten Fallbacks.

---

### 1.2 error_schemas.py - Response Schema

**Datei:** `El Servador/god_kaiser_server/src/schemas/error_schemas.py`

**ErrorCodeInfoResponse (Zeile 269-329):**

| Feld | Typ | Optional | NEU? |
|------|-----|----------|------|
| error_code | int | Required | Nein |
| title | Optional[str] | Optional | ✅ JA (Zeile 280-283) |
| category | str | Required | Nein |
| severity | str | Required | Nein |
| message | str | Required | Nein |
| troubleshooting | List[str] | Default [] | Nein |
| docs_link | Optional[str] | Optional | Nein (war schon da) |
| recoverable | bool | Default True | Nein |
| user_action_required | bool | Default False | Nein |

**ErrorLogResponse (Zeile 26-114):** Enthält ebenfalls alle enriched Felder inklusive `troubleshooting`, `docs_link`, `user_action_required`, `recoverable`, `context`, `esp_raw_message`.

**Konsistenz:** Alle Felder die `esp32_error_mapping.py` liefert sind im Schema abgebildet. ✅

---

### 1.3 errors.py - API Endpoints

**Datei:** `El Servador/god_kaiser_server/src/api/v1/errors.py`

| Endpoint | Method | Zeile | Beschreibung |
|----------|--------|-------|--------------|
| `/v1/errors/esp/{esp_id}` | GET | 88-203 | Error-Events für ein ESP |
| `/v1/errors/summary` | GET | 211-333 | Aggregierte Fehlerstatistiken |
| `/v1/errors/codes` | GET | 341-389 | Alle bekannten Error-Codes |
| `/v1/errors/codes/{error_code}` | GET | 397-437 | Einzelnen Error-Code nachschlagen |

**GET /codes/{error_code}:**
- Nutzt `ErrorCodeInfoResponse` Schema: ✅ (Zeile 399)
- Enthält `title` Feld: ✅ (`title=error_info.get("message_de")`, Zeile 429)
- 404 für unbekannte Codes: ✅ (Zeile 421-425)

**Router-Registrierung:** `prefix="/v1/errors"` (Zeile 41) ✅

**Bewertung:** ✅ Vollständig, korrekt registriert, 404 bei unbekannten Codes.

---

## Phase 2: Frontend Types

### 2.1 websocket-events.ts - ErrorEvent Interface

**Datei:** `El Frontend/src/types/websocket-events.ts`

**Interface (Zeile 137-159):**

| Feld | Typ | Optional | NEU? |
|------|-----|----------|------|
| esp_id | string | Required | Nein |
| esp_name | string | Optional | Nein |
| error_log_id | string | Optional | Nein |
| error_code | number \| string | Required | Nein |
| title | string | Optional | ✅ JA (Zeile 147) |
| category | string | Required | Nein |
| message | string | Required | Nein |
| troubleshooting | string[] | Optional | Nein |
| user_action_required | boolean | Required | Nein |
| recoverable | boolean | Required | Nein |
| docs_link | string \| null | Optional | ✅ JA (Zeile 156) |
| context | Record<string, unknown> | Optional | Nein |

**Server-Payload-Konsistenz:**
- `timestamp` fehlt im `data`-Bereich (Server sendet es aber) → Wird über `WebSocketEventBase.timestamp` abgedeckt. ⚠️ Minor: Das data-Feld hat kein timestamp, aber das Base-Interface hat es.
- Alle anderen Server-Felder sind abgebildet. ✅

**WebSocketEvent Union:** `ErrorEvent` ist enthalten (Zeile 430). ✅
**Type Guard:** `isErrorEvent()` vorhanden (Zeile 470-472). ✅

---

### 2.2 errors.ts - API Client

**Datei:** `El Frontend/src/api/errors.ts`

**Exportierte Funktionen:**

| Funktion | Parameter | Return-Type | Zeile |
|----------|-----------|-------------|-------|
| `translateErrorCode` | `code: number` | `Promise<TranslatedError>` | 46 |
| `translateErrorCodes` | `codes: number[]` | `Promise<Map<number, TranslatedError>>` | 75 |
| `clearTranslationCache` | - | `void` | 90 |

**TranslatedError Interface (Zeile 18-28):**

| Feld | Typ |
|------|-----|
| error_code | number |
| title | string? |
| category | string |
| severity | string |
| message | string |
| troubleshooting | string[] |
| docs_link | string? \| null |
| recoverable | boolean |
| user_action_required | boolean |

**Caching:** `Map<number, TranslatedError>` in-memory cache (Zeile 34). ✅
- Checks cache before API call (Zeile 48-49)
- Stores result in cache after fetch (Zeile 54)

**Fallback bei API-Fehler (Zeile 56-69):**
```typescript
{
  error_code: code,
  title: `Fehler ${code}`,
  category: 'unknown',
  severity: 'error',
  message: `Fehlercode ${code} ist nicht dokumentiert.`,
  troubleshooting: [],
  recoverable: true,
  user_action_required: false,
}
```
✅ Robust, zeigt nie einen Crash.

**Bewertung:** ✅ Vollständig, gecacht, mit Fallback.

---

## Phase 3: Handler-Prüfung

### 3.1 handleErrorEvent in esp.ts

**Datei:** `El Frontend/src/stores/esp.ts`, Zeile 2048-2102

**Payload-Extraktion (Zeile 2050-2056):**
```typescript
const title = data.title as string | undefined
const msg = data.message as string || 'Unbekannter Fehler'
const errorCode = data.error_code as number | undefined
const userActionRequired = data.user_action_required as boolean | undefined
const troubleshooting = data.troubleshooting as string[] | undefined
```
✅ Alle Phase-3-Felder extrahiert.

**Toast-Anzeige (Zeile 2096-2101):**
- Title: Verwendet `title || msg` als `displayTitle` (Zeile 2064) ✅
- Severity: Mapped `critical` → `error` Toast-Type (Zeile 2098) ✅
- Persistent: Ja, bei `critical` oder `error` (Zeile 2099) ✅

**Handlungsbedarf-Indikator (Zeile 2065-2066):**
- `userActionRequired` wird geprüft ✅
- Anzeige: `" — Handlungsbedarf"` wird an Message angehängt ✅

**Details Action-Button (Zeile 2070-2094):**
- Bedingung: `troubleshooting && troubleshooting.length > 0` ✅
- Bei Klick: `window.dispatchEvent(new CustomEvent('show-error-details', { detail: {...} }))` ✅
- Payload enthält alle Felder: error_code, title, description, severity, troubleshooting, user_action_required, esp_id, esp_name, docs_link, context, timestamp ✅

**Fallback für alte Payloads (ohne title):**
- `displayTitle = title || msg` (Zeile 2064) ✅
- Modal title: `title || \`Fehler ${errorCode}\`` (Zeile 2080) ✅

**Bewertung:** ✅ Vollständig, mit korrekten Fallbacks.

---

## Phase 4: Komponenten-Prüfung

### 4.1 TroubleshootingPanel.vue

**Datei:** `El Frontend/src/components/error/TroubleshootingPanel.vue`

**Props (Zeile 16-20):**

| Prop | Typ | Required | Default |
|------|-----|----------|---------|
| steps | string[] | Required | - |
| userActionRequired | boolean | Required | - |
| severity | ErrorSeverity | Optional | - |

**Template:**
- Handlungsbedarf-Badge: ✅ (Zeile 28-31, mit AlertTriangle Icon)
- Nummerierte Liste: `<ol>` mit manueller Nummerierung via `.step-number` Spans (Zeile 36-41) ✅
- Auto-Resolve-Hint bei `!userActionRequired && steps.length > 0` (Zeile 45-48) ✅

**Severity-abhängige Farben:**
- `.troubleshooting-panel--critical` (Zeile 60-63) ✅
- `.troubleshooting-panel--error` (Zeile 65-68) ✅
- `.troubleshooting-panel--warning` (Zeile 70-73) ✅

**Accessibility:** Semantisches `<ol>` verwendet ✅. Kein aria-label auf Badge (minor).

**Bewertung:** ✅ Vollständig, gutes Design.

---

### 4.2 ErrorDetailsModal.vue

**Datei:** `El Frontend/src/components/error/ErrorDetailsModal.vue`

**ErrorDetailsData Interface (Zeile 33-47):**

| Feld | Typ |
|------|-----|
| error_code | number? |
| title | string |
| description | string |
| severity | string |
| troubleshooting | string[] |
| user_action_required | boolean |
| recoverable | boolean? |
| esp_id | string? |
| esp_name | string? |
| docs_link | string? \| null |
| context | Record<string, unknown>? |
| timestamp | string? |
| raw_message | string? |

**Props:** `error?: ErrorDetailsData | null`, `open: boolean` (Zeile 49-52) ✅
**Emits:** `close: []` (Zeile 55) ✅

**Template-Struktur:**
- Header: Severity-Icon + Title + Close-Button (Zeile 134-153) ✅
- Meta: Error-Code, Category, Device-Name, Timestamp (Zeile 147-152) ✅
- Description (Zeile 157) ✅
- TroubleshootingPanel (Zeile 160-165, mit v-if guard) ✅
- Docs-Link (Zeile 168-177, external link with noopener) ✅
- Technical Details collapsible (Zeile 180-212) ✅
  - Raw Message ✅
  - ESP-ID ✅
  - Error-Code ✅
  - Recoverable ✅
  - Context JSON ✅

**Critical Severity Styling:**
- `error-modal--pulse` class (Zeile 128) ✅
- `shouldPulse()` utility from errorCodeTranslator ✅
- `@keyframes critical-pulse` (Zeile 260-263) ✅

**Closing:**
- Escape key: ✅ (Zeile 95-97, via watch on `open`)
- Backdrop click: ✅ (Zeile 99-101)
- X-Button: ✅ (Zeile 143)
- Cleanup in `onUnmounted`: ✅ (Zeile 112-114)

**Accessibility:**
- `role="dialog"`: ✅ (Zeile 129)
- `aria-modal="true"`: ✅ (Zeile 130)
- `aria-labelledby`: ✅ (Zeile 131)
- Focus-Trap: ❌ Nicht implementiert (minor)

**Bewertung:** ✅ Vollständig, hochqualitativ. Minor: Kein Focus-Trap.

---

### 4.3 App.vue - Modal Integration

**Datei:** `El Frontend/src/App.vue`

- ErrorDetailsModal importiert: ✅ (Zeile 7)
- ErrorDetailsData type importiert: ✅ (Zeile 8)
- Modal state: `errorModalOpen` ref + `errorModalData` ref (Zeile 14-15) ✅
- Event-Listener `show-error-details` registriert in `onMounted` (Zeile 25) ✅
- Event-Listener cleanup in `onUnmounted` (Zeile 30) ✅
- Template: `<ErrorDetailsModal :error="errorModalData" :open="errorModalOpen" @close="errorModalOpen = false" />` (Zeile 37-41) ✅

**Bewertung:** ✅ Sauber integriert, mit Cleanup.

---

### 4.4 EventDetailsPanel.vue - TroubleshootingPanel Integration

**Datei:** `El Frontend/src/components/system-monitor/EventDetailsPanel.vue`

- TroubleshootingPanel importiert: ✅ (Zeile 34)
- `errorDetails.troubleshooting` extrahiert (Zeile 222) ✅
- `errorDetails.userActionRequired` extrahiert (Zeile 223) ✅
- TroubleshootingPanel gerendert bei `errorDetails.troubleshooting.length > 0` (Zeile 717-723) ✅
- Props korrekt übergeben: `:steps`, `:user-action-required`, `:severity` ✅

**Critical Badge Styling:**
- `.severity-badge--critical` mit Puls-Animation (Zeile 952-957) ✅
- `@keyframes critical-badge-pulse` (Zeile 959-962) ✅

**Bewertung:** ✅ Korrekt integriert.

---

## Phase 5: Styling

**Critical vs Error Unterscheidung:**

| Eigenschaft | Error | Critical |
|-------------|-------|----------|
| Farbe | `#f87171` / `rgba(239, 68, 68, *)` | `#dc2626` / `#fca5a5` / `rgba(220, 38, 38, *)` |
| Animation | Keine | `critical-pulse` (Border) + `critical-badge-pulse` (Opacity) |
| Border | `rgba(239, 68, 68, 0.25)` | `rgba(220, 38, 38, 0.4)` + 2px |

Puls-Animationen definiert in:
- ErrorDetailsModal.vue Zeile 260-263: `critical-pulse` (Border-Color)
- EventDetailsPanel.vue Zeile 959-962: `critical-badge-pulse` (Opacity)

**Bewertung:** ✅ Konsistent, klare visuelle Unterscheidung.

---

## Phase 6: Integration & Flow

### Flow 1: Neuer Error via WebSocket
1. Server broadcast `error_event` mit title, troubleshooting etc. → ✅
2. `esp.ts:2048` empfängt via `ws.on('error_event', handleErrorEvent)` (Zeile 2375) → ✅
3. Toast zeigt `displayTitle` mit "Details"-Button wenn troubleshooting vorhanden → ✅
4. Klick → CustomEvent `show-error-details` → ✅
5. `App.vue:17` empfängt Event → öffnet `ErrorDetailsModal` → ✅

### Flow 2: Historischer Error in EventDetailsPanel
1. User klickt auf Error-Event → EventDetailsPanel zeigt Details → ✅
2. TroubleshootingPanel eingebunden wenn `errorDetails.troubleshooting.length > 0` → ✅
3. `errors.ts` API Client mit Cache für On-Demand-Lookups verfügbar → ✅

### Flow 3: Fallback für alte Server-Version
1. Server sendet `error_event` ohne `title` → ✅
2. `handleErrorEvent`: `displayTitle = title || msg` (Zeile 2064) → ✅
3. Toast funktioniert mit Fallback → ✅

---

## Konsistenz-Check

| Kriterium | Status |
|-----------|--------|
| UI-Texte Deutsch | ✅ ("Handlungsbedarf", "Troubleshooting-Schritte", "Technische Details", "Schließen", etc.) |
| Glassmorphism konsistent | ✅ (rgba backgrounds, backdrop-filter, border-opacity pattern) |
| CSS-Variablen genutzt | ✅ (--color-text-primary, --color-text-muted, --color-bg-secondary, --font-mono) |
| Hardcoded Farben | ⚠️ Severity-Farben hardcoded (#f87171, #dc2626, #fbbf24, #60a5fa) - konsistent across components |
| Gleiches Modal-Pattern | ✅ (Teleport to body, backdrop, Escape, close button) |
| Gleiches Toast-Pattern | ✅ (useToast mit message, type, persistent, actions) |
| Keine `any` Types | ✅ Keine in neuen Dateien |

---

## Zwei-Zielgruppen-Prinzip

- [x] **Operator** sieht: Titel, Beschreibung, Troubleshooting-Schritte, Handlungsbedarf-Badge
- [x] **Entwickler** sieht: Technische Details aufklappbar (Raw Message, ESP-ID, Error-Code, Kontext-JSON, Recoverable)
- [x] Keine technischen Details im Hauptbereich
- [x] Troubleshooting-Schritte sind actionable (nummerierte deutsche Anweisungen vom Server)

## Serverzentrische Architektur eingehalten?

- [x] Übersetzung kommt vom Server (`esp32_error_mapping.py` → `error_handler.py` → WebSocket)
- [x] Frontend zeigt nur an was Server sendet (TroubleshootingPanel ist rein presentational)
- [x] Fallback für alte Server-Payloads vorhanden (`title || msg`, `troubleshooting || []`)
- [x] On-Demand API Client (`errors.ts`) für historische Events die nachträglich übersetzt werden

---

## Kritische Issues

**Keine.**

## Warnungen

1. **Kein Focus-Trap** in ErrorDetailsModal → Keyboard-User können Tab außerhalb des Modals drücken. Low priority.
2. **Severity-Farben hardcoded** statt über CSS-Variablen. Konsistent aber weniger wartbar. Bestehendes Pattern im Projekt.
3. **`timestamp` fehlt im ErrorEvent `data` Interface** (websocket-events.ts Zeile 141-158), wird aber vom Server gesendet. Das Base-Interface hat `timestamp` im Envelope, also kein Datenverlust, aber das `data`-Feld ist inkompatibel mit dem tatsächlichen Server-Payload.

## Verbesserungsvorschläge

1. Focus-Trap für ErrorDetailsModal (z.B. via `@vueuse/core` `useFocusTrap`)
2. `timestamp` zu ErrorEvent.data hinzufügen für vollständige Typ-Sicherheit

---

## Fazit

**Phase 3 ist VOLLSTÄNDIG und KORREKT implementiert.**

Die Implementation ist:
- **Architektonisch korrekt**: Server-centric, ESP-Daten werden trusted, Enrichment nur für User-Messages
- **Robust**: Fallbacks für unbekannte Codes, alte Payloads, API-Fehler
- **Konsistent**: Gleiches Pattern-Vocabulary wie Rest der Codebase
- **Zwei-Zielgruppen**: Operator-First mit Developer-Details hinter Toggle
- **Vollständig**: Alle behaupteten Änderungen sind verifiziert und korrekt implementiert
