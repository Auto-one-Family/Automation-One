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

## 5) Mock-Schema vs reales Schema (Pflichtnachweise)

## 5.1 Abweichung A: Zone-Remove Endpoint

- Mock-Schema: `tests/mocks/handlers.ts` nutzt `POST /api/v1/zone/devices/:espId/remove`.
- Reales Schema (Frontend API-Client): `src/api/zones.ts` nutzt `DELETE /zone/devices/{deviceId}/zone`.
- Konkrete Abweichung:
  - Methode: POST vs DELETE
  - Pfad: `/remove` vs `/zone`
- Risiko:
  - Tests koennen in Mock "gruen" sein, obwohl produktive API-Signatur geaendert/defekt ist.

## 5.2 Abweichung B: `config_response` Payload-Contract

- Mock-Schema: `tests/mocks/websocket.ts::simulateConfigResponse()` sendet `data` ohne `correlation_id`; Status erlaubt `partial_success | error`.
- Reales Schema: `src/types/websocket-events.ts::ConfigResponseEvent` fordert `data.correlation_id` (pflicht) und `status: "success" | "failed"`.
- Konkrete Abweichung:
  - Pflichtfeld fehlt (`correlation_id`)
  - Statuswerte nicht deckungsgleich
- Risiko:
  - Terminale Intent-Finalisierung wird im Test nicht realitaetsnah validiert.

## 5.3 Abweichung C: WS Eventinventar in Mock unvollstaendig

- Mock-Schema (`tests/mocks/websocket.ts::MessageType`) enthaelt u. a. nicht:
  - `intent_outcome`, `intent_outcome_lifecycle`
  - `subzone_assignment`
  - `notification_new`, `notification_updated`, `notification_unread_count`
- Reales Schema (`src/types/index.ts::MessageType`, `src/stores/esp-websocket-subscription.ts`) nutzt diese Events produktiv.
- Konkrete Abweichung:
  - Mock-Typeunion ist enger/alt, reale Realtime-Pfade werden nicht durch Mock-Tests abgedeckt.
- Risiko:
  - Contract-Drift bleibt verborgen, besonders in Notification-/Intent-Workflows.

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

## 7) Priorisierte Umsetzungsreihenfolge (mit Aufwandsschaetzung)

1. T1 Editor E2E (P0, L)  
2. T2 Admin Ops E2E (P0, L)  
3. T3 Notifications/QuickActions E2E (P0, M-L)  
4. T4 Mock-Parity REST (P0, M)  
5. T9 WS-Contract-Parity (P1, S-M)  
6. T5 Monitor L1/L3 + Recovery (P1, M)  
7. T8 401/403/Refresh-Parallellast (P1, M)  
8. T7 Auth/User/Settings Admin-Flow (P1, M)  
9. T6 Inventar/Kalibrierung (P1, M)  
10. T10 Guard-Matrix (P1, S)

Gesamtschaetzung P0+P1: ca. 8.5 bis 10.5 PT.

---

## 8) Akzeptanzkriterien F14 - Check

- Jede P0/P1-Luecke hat mindestens einen konkreten Testauftrag: erfuellt (T1-T10).
- Priorisierte Reihenfolge mit Aufwandsschaetzung enthalten: erfuellt (Abschnitt 7).
- Pflichtnachweise enthalten:
  - Testfall -> Input -> erwarteter Store/UI-Effekt: erfuellt (Abschnitt 6).
  - Mock-Schema -> reales Schema -> konkrete Abweichung: erfuellt (Abschnitt 5).

