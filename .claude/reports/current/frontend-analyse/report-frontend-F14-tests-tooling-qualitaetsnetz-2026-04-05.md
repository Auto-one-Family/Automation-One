# Report F14: Tests, Tooling, Qualitaetsnetz

Datum: 2026-04-05  
Scope: `El Frontend/tests/unit/**`, `El Frontend/tests/e2e/**`, `El Frontend/tests/mocks/**`, `El Frontend/vitest.config.ts`, `El Frontend/playwright*.ts`, `El Frontend/package.json`  
Ziel: Testabdeckung F01-F13 messen, E2E-Reisen bewerten, Mock-vs-Contract-Drift belegen, und konkrete P0/P1-Regressionstest-Auftraege priorisieren.

---

## 1) Executive Result

- Testlandschaft ist breit, aber ungleich verteilt: stark in Hardware/Logic/WebSocket, schwach bis leer in Editor, Admin/Ops, Notifications, Inventar/Kalibrierung.
- E2E-Reisen sind fuer `hardware` und `auth` gut vertreten, fuer `monitor` nur teilweise, fuer `editor` und `admin` faktisch nicht vorhanden.
- Mocks verdecken aktuell reale Vertragsrisiken (REST und WS): mindestens drei konkrete Schema-/Endpoint-Abweichungen sind nachweisbar.
- Akzeptanzkriterium erreicht: Jede identifizierte P0/P1-Luecke hat mindestens einen konkreten Testauftrag mit Reihenfolge und Aufwand.

---

## 2) Tooling-Status

## 2.1 Vitest

- `vitest.config.ts`: `environment: "happy-dom"`, `setupFiles: ["tests/setup.ts"]`, Includes `tests/**/*.test.ts`.
- Unit-Suite ist gross (54 Unit-Dateien, hohe Testdichte in mehreren Kernstores/utils).
- Auffaellig: keine dedizierte Struktur fuer Integrationsnahe Frontend-Flows (z. B. Auth-Guard-Matrix, API-Refresh-Rennen als isolierte suite).

## 2.2 Playwright

- `playwright.config.ts`: Multi-Browser + Mobile/Tablet, Global Setup/Teardown, Auth-State-Reuse.
- `playwright.css.config.ts`: separates CSS-Testprofil ohne Auth-Zwang.
- E2E-Szenarien vorhanden (11 Scenario-Dateien), aber Schwerpunkt auf Hardware/Logic; kaum Admin/Ops und kein Editor-Flow.

## 2.3 package.json Skripte

- Gute Skriptabdeckung (`test`, `test:unit`, `test:e2e`, `test:css`, `test:playwright`).
- Kein explizites "contract parity" Testskript fuer Mock-Handler gegen API-/WS-Types.

---

## 3) Heatmap F01-F13 (Abdeckung und Luecken)

Legende:
- Abdeckung: Hoch / Mittel / Niedrig / Keine
- Risiko: P0 (kritisch), P1 (hoch), P2 (mittel)

| Bereich | Testabdeckung (IST) | Evidenz | Luecke | Risiko |
|---|---|---|---|---|
| F01 Routing/Guards | Mittel | `auth.spec.ts`, `auth.test.ts`, Redirects indirekt in E2E | Keine explizite Guard-Entscheidungsmatrix als Tests | P1 |
| F02 Design Tokens | Hoch | 13 CSS-Playwright Specs (`tests/e2e/css/*`) | Kein Contract-Test "Token-Quelle = einzige Quelle" | P2 |
| F03 Pinia Ownership | Hoch | viele Store-Unit-Tests (`esp`, `logic`, `dashboard`, `auth`, `dragState`) | Cross-store Seiteneffekte nicht als Integrationsszenario abgesichert | P2 |
| F04 REST/Retry/Error | Niedrig-Mittel | indirekt ueber Store/Komponenten-Tests | 401-Queue, 403-UX, parallel refresh Rennen kaum explizit getestet | P1 |
| F05 WS/Contract | Hoch (Core), Mittel (Parity) | `contractEventMapper.test.ts`, `intent-contract-matrix.test.ts`, `esp-websocket-subscription.test.ts` | Mock-WS-Typeinventar driftet vom realen Vertrag | P1 |
| F06 Hardware/DnD | Hoch | `hardware-view.spec.ts` (22 Tests), `subzone-monitor-flow.spec.ts` | ACK/Timeout-Edgecases nur teilweise | P2 |
| F07 Monitor Live | Mittel | `subzone-monitor-flow.spec.ts`, Teile in `sensor-live.spec.ts` | L1/L3, Disconnect, Error/Empty/Loading nicht vollstaendig | P1 |
| F08 Editor/Widgets | Niedrig | nur `dashboard.test.ts` (Store) | Kein `/editor` E2E End-to-End, keine Widget-Persistenzreise | P0 |
| F09 Logic UI/Feedback | Hoch | `logic-engine.spec.ts`, `humidity-logic.spec.ts`, `hysteresis-logic.spec.ts`, `logic*.test.ts` | Konflikt-/Finalitaetsfaelle noch punktuell | P2 |
| F10 Inventar/Kalibrierung | Niedrig | keine dedizierten E2E fuer `SensorsView`/`CalibrationView` | Kernflows ohne Regressionstestnetz | P1 |
| F11 Admin/Ops/Plugins | Niedrig | `plugins.test.ts`, `PluginConfigDialog.test.ts` | Keine E2E-Reisen fuer `/system-monitor`, `/plugins`, `/users`, `/email` | P0 |
| F12 Auth/User/Settings | Mittel | `auth.spec.ts`, `auth.test.ts` | User-Management-CRUD + Logout-all + Settings Persistenz nicht E2E-abgedeckt | P1 |
| F13 Notifications/QuickActions | Keine bis sehr niedrig | keine dedizierten notification/quick-action Store-Tests auffindbar | End-to-end Event->Inbox->Badge->Action fehlt komplett | P0 |

---

## 4) E2E-Reisen (Pflicht: Hardware, Monitor, Editor, Auth, Admin)

| Reise | Status | Nachweis | Bewertung |
|---|---|---|---|
| Hardware | Abgedeckt | `hardware-view.spec.ts` | Stark |
| Monitor | Teilweise | `subzone-monitor-flow.spec.ts`, `sensor-live.spec.ts` | Unvollstaendig (L1/L3/Failure) |
| Editor | Nicht abgedeckt | kein `/editor` Scenario gefunden | Kritische Luecke |
| Auth | Abgedeckt | `auth.spec.ts`, `esp-registration-flow.spec.ts` | Solide |
| Admin | Nicht abgedeckt | kein Scenario fuer `/system-monitor`, `/plugins`, `/users`, `/system-config`, `/email` | Kritische Luecke |

---

## 5) Parity-Matrix: API client|types -> mock handlers/events

Legende:
- **Status**: OK / Drift / Missing
- **Gate**: Ziel fuer CI fail-fast

## 5.1 REST-Parity-Matrix

| Contractquelle (Frontend) | Mock-Abdeckung (`tests/mocks/handlers.ts`) | Status | Nachweis | Gate-Regel |
|---|---|---|---|---|
| `zonesApi.removeZone()` -> `DELETE /zone/devices/{id}/zone` | `POST /api/v1/zone/devices/:espId/remove` | **Drift (P0)** | Methode + Pfad weichen ab | CI fail bei Method-/Path-Mismatch |
| `zonesApi.assignZone()` -> `POST /zone/devices/{id}/assign` | `POST /api/v1/zone/devices/:espId/assign` | OK (normalisiert) | Semantik deckungsgleich | Pfad-Template normalisieren (`{id}`==`:id`) |
| `notificationsApi.*` -> `/notifications/*` | keine Notification-Handler | **Missing (P0)** | 0 Treffer in Mock-Handlern | CI fail bei fehlenden P0-Endpunkten |
| `usersApi.*` -> `/users*` | keine User-Handler | **Missing (P1)** | 0 Treffer in Mock-Handlern | CI warn/fail je Prioritaet |
| `zonesApi.*Entity` -> `/zones*` | keine Zone-Entity-Handler | **Missing (P1)** | 0 Treffer in Mock-Handlern | CI warn/fail je Prioritaet |
| `diagnosticsApi.*` -> `/diagnostics/*` | keine Diagnostics-Handler | **Missing (P1)** | 0 Treffer in Mock-Handlern | CI warn/fail je Prioritaet |
| `espApi`/`actuatorsApi` Kernpfade | weitgehend vorhanden | OK (core) | ESP/Actuator-Flows abgedeckt | Vollstaendigkeitstest fuer P0-Kernreisen |

## 5.2 WS-Parity-Matrix

| Contractquelle (`src/types` + Store Subscription) | Mock-Abdeckung (`tests/mocks/websocket.ts`) | Status | Nachweis | Gate-Regel |
|---|---|---|---|---|
| `intent_outcome`, `intent_outcome_lifecycle` | fehlen | **Missing (P0)** | nicht in Mock-`MessageType` | CI fail bei Missing-Event |
| `notification_new`, `notification_updated`, `notification_unread_count` | fehlen | **Missing (P0)** | nicht in Mock-`MessageType` | CI fail bei Missing-Event |
| `subzone_assignment` | fehlt | **Missing (P1)** | nicht in Mock-`MessageType` | CI fail/warn nach Prioritaet |
| `sensor_config_deleted`, `actuator_config_deleted` | fehlen | **Missing (P1)** | nicht in Mock-`MessageType` | CI fail/warn nach Prioritaet |
| `device_scope_changed`, `device_context_changed` | fehlen | **Missing (P1)** | nicht in Mock-`MessageType` | CI fail/warn nach Prioritaet |
| `config_response` Payload (`correlation_id`, Statuswerte) | Mock erlaubt `partial_success|error`, ohne `correlation_id` | **Drift (P0)** | Typ-/Payload-Contract abweichend | CI fail bei Payload-Schema-Mismatch |

## 5.3 CI-Fail-Fast-Design (Parity Gates)

### Gate G1 (P0): REST Kernvertrag
- Testdatei: `tests/unit/contracts/rest-endpoint-parity.test.ts`
- Vergleich:
  - Quelle A: Endpoint-Matrix aus `src/api/*.ts` (method + normalized path)
  - Quelle B: Endpoint-Matrix aus `tests/mocks/handlers.ts`
- Fail-Bedingung:
  - Missing/Drift fuer P0-Pfade (`/auth/*`, `/zone/devices/*`, `/notifications/*`, `/actuators/*`, `/esp/*`)

### Gate G2 (P0): WS Event-Parity
- Testdatei: `tests/unit/contracts/ws-event-parity.test.ts`
- Vergleich:
  - `src/types/index.ts::MessageType`
  - `src/stores/esp-websocket-subscription.ts::ESP_STORE_WS_SUBSCRIPTION_TYPES`
  - `tests/mocks/websocket.ts::MessageType`
- Fail-Bedingung:
  - Event fehlt in einer Quelle (P0-Events)
  - Extra Event nur im Mock (unerwarteter Drift)

### Gate G3 (P0): WS Payload-Contract
- Testdatei: `tests/unit/contracts/ws-payload-parity.test.ts`
- Fokus:
  - `config_response` Muss-Felder (`correlation_id`, `status` Enum)
  - Notification-Inbox Events (`notification_new|updated|unread_count`)
- Fail-Bedingung:
  - Typ-/Schemaabweichung zwischen produktivem Type-Vertrag und Mock-Fabriken

### Gate G4 (P1): Mock-Coverage fuer Admin/Ops
- Testdatei: `tests/unit/contracts/admin-mock-coverage.test.ts`
- Fokus:
  - `/users*`, `/zones*`, `/diagnostics/*`, `/notifications/*`
- Fail-Bedingung:
  - Unabgedeckte P1-Endpunkte (konfigurierbar: erst Warnung, ab Termin X fail)

---

## 6) P0/P1 Findings -> konkrete Regressionstest-Auftraege

Form je Auftrag:
- Testfall
- Input
- Erwarteter Store/UI-Effekt
- Aufwand

## P0-Backlog (sofort)

### T1 (P0) - Editor End-to-End Reise absichern

- Testfall: `/editor` Dashboard-Lifecycle (create -> add widget -> configure -> save -> reload -> state restored).
- Input: Nutzer erstellt neues Dashboard, fuegt `line-chart` + `gauge` hinzu, setzt Sensor, speichert.
- Erwarteter Store/UI-Effekt:
  - `dashboard.store.layouts` enthaelt neues Layout + Widgets.
  - Nach Reload identische Widget-Positionen/Configs sichtbar.
- Aufwand: L (1.5-2.0 PT)

### T2 (P0) - Admin Ops Hauptreise (System Monitor)

- Testfall: `/system-monitor` Tabs `health/events/database/logs` mit Filter/Reload.
- Input: Login als Admin, Tabwechsel, Filterwechsel, Trigger eines Refresh.
- Erwarteter Store/UI-Effekt:
  - Tab-spezifische Datenquellen laden ohne Guard/Route-Fehler.
  - Error/Loading States werden konsistent angezeigt.
- Aufwand: L (1.5 PT)

### T3 (P0) - Notifications + Quick Actions End-to-End

- Testfall: WS `notification_new` -> Inbox/Badge -> markRead/ack -> QuickAction-Reaktion.
- Input: Simulierter WS-Event (kritisch), dann Nutzeraktion "als gelesen markieren" + QuickAction ausfuehren.
- Erwarteter Store/UI-Effekt:
  - `notification-inbox` erhoeht `unreadCount`, Badge aktualisiert.
  - Nach markRead sinkt `unreadCount`, Drawer-Item-Status aktualisiert.
- Aufwand: M-L (1.0-1.5 PT)

### T4 (P0) - Mock-Parity Guard fuer REST-Endpunkte

- Testfall: Contract-Test vergleicht `src/api/*` Routen gegen `tests/mocks/handlers.ts`.
- Input: Endpoint-Matrix (Methode + Pfad) aus API-Clients und MSW-Handlern.
- Erwarteter Store/UI-Effekt:
  - Build/Test failt bei Mismatch (z. B. zone remove POST/DELETE Drift).
- Aufwand: M (0.75 PT)

## P1-Backlog (hoch)

### T5 (P1) - Monitor L1/L3 + Disconnect Recovery

- Testfall: `/monitor` L1 -> L2 -> L3 mit WS-Ausfall und Reconnect.
- Input: Routewechsel, WS disconnect simulieren, reconnect simulieren.
- Erwarteter Store/UI-Effekt:
  - Statusindikatoren wechseln sichtbar (connected/disconnected/recovered).
  - Nach Reconnect werden Kartenwerte aus aktuellem Store/API konsistent.
- Aufwand: M (1.0 PT)

### T6 (P1) - Inventar + Kalibrierung Regression

- Testfall: `/sensors` Detail/Filter + `/calibration` success/error Pfad.
- Input: Inventarzeile oeffnen, Kontext speichern, Kalibrierung mit gueltigem/ungueltigem Payload.
- Erwarteter Store/UI-Effekt:
  - `inventory.store` Filter/Paging korrekt.
  - Wizard wechselt sauber in `done` bzw `error`.
- Aufwand: M (1.0 PT)

### T7 (P1) - Auth/User/Settings Admin-Flow

- Testfall: Login admin -> `/users` CRUD (create/update/delete/reset) -> logout-all.
- Input: valide/invalid payloads fuer User-Aktionen.
- Erwarteter Store/UI-Effekt:
  - Userliste aktualisiert nach mutierenden Aktionen.
  - Bei Fehlern konsistente Error-UI; bei logout-all Session sauber beendet.
- Aufwand: M (1.0 PT)

### T8 (P1) - 401/403/Refresh-Parallellast

- Testfall: Mehrere parallele Requests mit abgelaufenem Token + ein 403-Endpoint.
- Input: 3-5 gleichzeitige API Calls -> 401, danach refresh; separater 403 Case.
- Erwarteter Store/UI-Effekt:
  - Genau ein Refresh-Lauf, Requests werden korrekt wiederholt.
  - 403 fuehrt zu reproduzierbarer UI-Fehlerrueckmeldung (kein Silent-Fail).
- Aufwand: M (0.75-1.0 PT)

### T9 (P1) - WS Contract-Parity Test (MessageType vs Mock vs Subscription)

- Testfall: statischer Parity-Test zwischen:
  - `src/types/index.ts::MessageType`
  - `src/stores/esp-websocket-subscription.ts`
  - `tests/mocks/websocket.ts::MessageType`
- Input: Eventlisten der drei Quellen.
- Erwarteter Store/UI-Effekt:
  - Test failt bei fehlenden/zusatzlichen Eventtypen.
  - Verhindert schleichende Contract-Drift in Mocks.
- Aufwand: S-M (0.5-0.75 PT)

### T10 (P1) - Guard-Entscheidungsmatrix

- Testfall: Router-Guard Pfade fuer setup required, unauthenticated, non-admin, authenticated.
- Input: kontrollierte Auth-Store-Zustaende je Test.
- Erwarteter Store/UI-Effekt:
  - deterministische Redirect-Ziele pro Zustand.
  - keine ungetesteten Guard-Zweige.
- Aufwand: S (0.5 PT)

---

## 7) Priorisierte Umsetzungsreihenfolge T1..Tn (Aufwand + Blocker)

| Task | Prio | Inhalt | Aufwand | Hauptrisiko/Blocker |
|---|---|---|---|---|
| T1 | P0 | Editor-E2E (`/editor` create->save->reload parity) | L (1.5-2.0 PT) | Fehlende stabile Testdaten fuer Widget-Layout + Persistenz |
| T2 | P0 | Admin-Ops-E2E (`/system-monitor`, `/plugins`, `/users`, `/email`) | L (1.5 PT) | Kein konsistenter Mock fuer Admin-Endpunkte (`users/notifications/diagnostics`) |
| T3 | P0 | Notifications/QuickActions E2E (WS->Inbox->Badge->Action) | M-L (1.0-1.5 PT) | WS-Mock deckt Notification-Events aktuell nicht vollstaendig |
| T4 | P0 | REST-Parity-Gate G1 implementieren | M (0.75 PT) | Endpoint-Extraktion aus API-Clients robust normalisieren |
| T5 | P0 | WS-Parity-Gates G2+G3 implementieren | M (0.75-1.0 PT) | Vereinheitlichung `MessageType` zwischen Types/Store/Mock |
| T6 | P1 | Monitor L1/L3 + Disconnect Recovery E2E | M (1.0 PT) | Deterministische Disconnect/Reconnect-Simulation im Test |
| T7 | P1 | Auth/User/Settings Admin-Flow E2E | M (1.0 PT) | Seed/Reset fuer User-CRUD ohne Seiteneffekte |
| T8 | P1 | 401/403/Refresh-Parallellast (Unit+E2E) | M (0.75-1.0 PT) | Reproduzierbare Parallelitaet ohne Flaky Timing |
| T9 | P1 | Inventar+Kalibrierung Regression E2E | M (1.0 PT) | Fehlende Mock-Payloads fuer Kalibrierungsfehlerpfade |
| T10 | P1 | Guard-Entscheidungsmatrix Unit | S (0.5 PT) | Router/Auth-Store Fixture-Standardisierung |

Gesamtschaetzung P0+P1: ca. 8.75 bis 11.25 PT.

### Blocker-Log (quer ueber T1..T10)

1. **Mock-Parity-Basis fehlt**: ohne G1/G2/G3 bleiben E2E-Resultate teilweise nicht vertrauenswuerdig.  
2. **Admin-Endpunkte unvollstaendig gemockt**: verhindert stabile P0-Reisen fuer F11/F12/F13.  
3. **WS-Testharness fuer Notification-/Intent-Events unvollstaendig**: blockiert T3 direkt.  
4. **Deterministische Daten-Seeds fehlen fuer Editor/Kalibrierung**: erhoeht Flaky-Risiko in T1/T9.

---

## 8) Akzeptanzkriterien F14 - Check

- Jede P0/P1-Luecke hat mindestens einen konkreten Testauftrag: erfuellt (T1-T10).
- Priorisierte Reihenfolge mit Aufwandsschaetzung enthalten: erfuellt (Abschnitt 7).
- Pflichtnachweise enthalten:
  - Testfall -> Input -> erwarteter Store/UI-Effekt: erfuellt (Abschnitt 6).
  - Mock-Schema -> reales Schema -> konkrete Abweichung: erfuellt (Abschnitt 5).

