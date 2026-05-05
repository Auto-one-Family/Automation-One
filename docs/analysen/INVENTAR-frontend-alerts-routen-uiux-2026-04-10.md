# Inventar — Frontend-Alerts: Routen, UI-Zugänge, Stores, API, WebSocket

**Datum:** 2026-04-10  
**Branch:** `auto-debugger/work`  
**Canonical:** diese Datei (`docs/analysen/INVENTAR-frontend-alerts-routen-uiux-2026-04-10.md`) — keine zweite Vollmatrix parallel.

**Methodik:** Read/Grep/Glob im Repo `El Frontend/src` (Stand Umsetzung).

---

## Matrix

| UI-Oberfläche | Route / Kontext | Store(s) | REST (`src/api/notifications.ts` + andere) | WebSocket-Events | Inkonsistenz / Risiko | Priorität | Konkrete Pfade |
|---------------|-----------------|----------|--------------------------------------------|------------------|------------------------|-----------|----------------|
| **NotificationDrawer** (SlideOver) | App-weit (`App.vue`), keine eigene Route | `notification-inbox.store`, `alert-center.store` | `GET /notifications`, `GET …/unread-count`, `PATCH …/{id}/read`, `PATCH …/{id}/acknowledge`, `PATCH …/{id}/resolve`, `PATCH …/resolve-all`, `GET …/email-log` | `notification_new`, `notification_updated`, `notification_unread_count` (Dispatch über `esp.store`) | Tab-Counts mischen **Server-Stats** (`alertStats`) mit **lokaler Liste** (nur geladene Seiten) → kurz divergierende Zahlen möglich; **P2:** `SlideOver`-Subtitle trennt Inbox von `error_event`; **P3:** Sync-Hinweis unter Status-Tabs | **P3** (umgesetzt) | `El Frontend/src/components/notifications/NotificationDrawer.vue`, `El Frontend/src/shared/design/primitives/SlideOver.vue`, `El Frontend/src/shared/stores/notification-inbox.store.ts`, `El Frontend/src/shared/stores/alert-center.store.ts`, `El Frontend/src/App.vue` |
| **NotificationBadge** (Glocke, TopBar) | App-weit | `notification-inbox.store`, `alert-center.store`, `esp.store` | indirekt (Initialzustand via App) | wie Inbox | Zähler: **unresolved Alerts** (`active+ack`) vor **unread** — Operator muss unterscheiden (nicht dieselbe Metrik wie reine Unread) | **P3** | `El Frontend/src/components/notifications/NotificationBadge.vue`, `El Frontend/src/shared/design/layout/TopBar.vue` |
| **AlertStatusBar** (TopBar) | App-weit | `alert-center.store`, `notification-inbox.store`, `esp.store` | Stats-Polling | wie Inbox | Kombiniert ISA-18.2-Stats mit **unread**-Chip; **Polling 30s** vs **WS** kann Count kurz verzögern anzeigen | **P3** | `El Frontend/src/components/notifications/AlertStatusBar.vue` |
| **QuickAlertPanel** (FAB-Subpanel) | Overlay auf allen authentifizierten Routen | `notification-inbox.store`, `alert-center.store`, `quickAction.store`, `esp.store` | Ack/Resolve wie Drawer; Snooze: `sensorsApi.getAlertConfig` / `updateAlertConfig` (`src/api/sensors.ts`) | keine eigenen WS-Listener (Inbox aktualisiert via `esp.store`) | Vor P1: Ack/Resolve bei `false` **ohne Toast**; Batch-Ack zeigte Erfolg auch bei stillen Fehlern; **P4:** `data-testid` auf Panel/Zeilen/Aktionen | **P1** (adressiert); **P4** (testids) | `El Frontend/src/components/quick-action/QuickAlertPanel.vue` |
| **AlarmListWidget** (Dashboard-Widget) | Dashboard-Kacheln (Route abhängig vom Layout) | `alert-center.store`, `notification-inbox.store`, `esp.store` | keine direkten Calls; nur Drawer öffnen | — | Kein Inline-Ack/Resolve; **ein** Einstieg (Drawer) — bewusst schlank, aber andere UX als QuickPanel/Drawer | **P2** (Klarheit/Deep-Link) | `El Frontend/src/components/dashboard-widgets/AlarmListWidget.vue` |
| **System Monitor — HealthTab / HealthSummaryBar** | `/system-monitor` (`router`: `system-monitor`) | `alert-center.store` | `GET /notifications/alerts/stats` (über `fetchStats`) | — | Alert-KPIs getrennt von **error_event**-Forensik (andere Tabs); **P2:** Alert-Chips „Inbox · …“, `title`/`aria-label` | **P2** (teilweise) | `El Frontend/src/components/system-monitor/HealthTab.vue`, `HealthSummaryBar.vue`, `El Frontend/src/router/index.ts` |
| **System Monitor — EventsTab / MonitorTabs** | `/system-monitor`, Tab „Ereignisse (Stream)“ | — (Anzeige) | — | Stream inkl. `error_event` über aggregierte Events | **P2:** Tab-Label + einzeiliger Hinweis: Stream vs. Glocke/Inbox | **P2** | `El Frontend/src/components/system-monitor/EventsTab.vue`, `MonitorTabs.vue`, `El Frontend/src/views/SystemMonitorView.vue` |
| **Transiente Fehler-Toasts** | App-weit | `notification.store` | — | `error_event` (Handler in `esp.store` registriert) | **Zweite Kette:** persistierte Inbox (`notification_*`) vs **error_event** (Toast + optional Modal) — nicht dieselbe Datenbasis; **P2:** Toast-Präfix `Echtzeit ·` | **P2** (UX geklärt) | `El Frontend/src/shared/stores/notification.store.ts`, `El Frontend/src/stores/esp.ts` (Dispatcher), `El Frontend/src/stores/esp-websocket-subscription.ts` |
| **Legacy-Toast „notification“** | App-weit | `notification.store` | — | Event-Typ `notification` (nicht `notification_new`) | Älteres Kurztoast-Schema vs strukturierte Inbox-DTOs | **P4** (Dokumentation/Deprecation) | `El Frontend/src/shared/stores/notification.store.ts`, `El Frontend/src/types/index.ts` (WS-Typen) |
| **MonitorView + QuickActionBall** | `/monitor`, `/monitor/:zoneId`, … | QuickPanel → oben | — | — | FAB-Zugang parallel zu TopBar — gleiche Stores nach P1 | **P4** | `El Frontend/src/views/MonitorView.vue`, `El Frontend/src/components/quick-action/QuickActionBall.vue` |
| **Quick Action — Menü-Badge** | authentifizierte Routen (FAB) | `quickAction.store`, `notification-inbox.store`, `alert-center.store` | keine direkten REST-Calls | — (Zähler aus Stores/WS) | Badge mischt **unresolved** mit **unread** — konsistent mit NotificationBadge-Logik, aber anderer Einstieg | **P3** | `El Frontend/src/shared/stores/quickAction.store.ts`, `El Frontend/src/components/quick-action/QuickActionBall.vue`, `El Frontend/src/components/quick-action/QuickActionMenu.vue` |
| **App-Shell Bootstrap** | alle Routen (`App.vue`) | `notification-inbox.store`, `alert-center.store` | `loadInitial` → `GET /notifications` (Paging), `GET …/alerts/stats` | WS über `espStore` (nach Auth) | Nach Login: **Stats-Polling** startet; Inbox-Liste vs. Stats können kurz divergieren | **P3** | `El Frontend/src/App.vue` |
| **Quick Action — FAB + Menü** | authentifizierte Routen (FAB) | `quickAction.store` | keine direkten REST-Calls im Menü | — | Einstieg zu **Alert-Panel** (`setActivePanel('alerts')`) parallel zu TopBar; **P4:** stabile `data-testid` auf FAB-Toggle und Menüzeilen (`quick-action-item-${id}`) | **P4** (testids umgesetzt) | `El Frontend/src/components/quick-action/QuickActionBall.vue`, `El Frontend/src/components/quick-action/QuickActionMenu.vue` |
| **ToastContainer (Finalität)** | App-weit (`App.vue`) | `useToast` (Composable) | — | — | Rendert Fehler-Toasts für Ack/Resolve-Fehler aus Drawer/QuickPanel (**P1**); keine eigene Alert-Logik | **P1** | `El Frontend/src/shared/design/patterns/ToastContainer.vue`, `El Frontend/src/App.vue` |

---

## REST ↔ WS (Kurz)

- **Persistierte Inbox / Alerts:** `notificationsApi` (`El Frontend/src/api/notifications.ts`) — Endpunkte `…/acknowledge`, `…/resolve`, `…/alerts/stats`, `…/alerts/active`, etc.; Server spiegelt Änderungen typischerweise als **`notification_updated`** / **`notification_unread_count`** (Frontend: `notification-inbox.store`).
- **error_event:** kein `notification_*`-Lebenszyklus; `notification.store` → Toast / `show-error-details` — nicht mit Inbox-Datensätzen vermischen.

---

## Status P2–P4 (Kurzüberblick)

| Paket | Plan |
|-------|------|
| **P2** | ~~Sichtbare Trennung Inbox vs. `error_event`~~ — **umgesetzt** (siehe Abschnitt „Umsetzung P2“). |
| **P3** | ~~Poll vs. WS~~ — **umgesetzt** (`statsSyncedAt`, `inboxLiveTouchedAt`, Drawer-Zeile `notification-drawer-sync-hint`, `AlertStatusBar` `aria-label`; siehe „Umsetzung P3“). |
| **P4** | ~~Additive `data-testid` + Playwright~~ — **umgesetzt** (Abschnitt „Umsetzung P4“; Ausführung E2E nur mit Stack). |

**P4 nicht nötig für:** AlarmListWidget bleibt bewusst ohne eigene Ack-Buttons — E2E-Fokus auf Drawer/QuickPanel genügt für P1-Absicherung.

---

## Umsetzung P2 — Zwei-Ketten-Klarheit (Inbox vs. `error_event`)

- **`SlideOver`:** optionales `subtitle` — `El Frontend/src/shared/design/primitives/SlideOver.vue`.
- **NotificationDrawer:** `subtitle` mit knapper Operator-Regel (Server-Inbox vs. Echtzeit-Toasts) — `El Frontend/src/components/notifications/NotificationDrawer.vue`.
- **`error_event`-Toasts:** Präfix `Echtzeit ·` in `handleErrorEvent` — `El Frontend/src/shared/stores/notification.store.ts` (WebSocket-Kette bleibt unverändert; nur Anzeige).
- **TopBar-Glocke:** `aria-label` / `title` erwähnen Server-Inbox vs. Echtzeit — `El Frontend/src/components/notifications/NotificationBadge.vue`.
- **AlertStatusBar:** erweitertes `assistiveLabel` (Server-Inbox vs. `error_event`) — `El Frontend/src/components/notifications/AlertStatusBar.vue`.
- **Systemmonitor:** Tab `Ereignisse (Stream)` — `MonitorTabs.vue`; Hinweiszeile im **EventsTab** — `EventsTab.vue`; Health-Summary-Alert-Chips „Inbox · …“ + `title`/`aria-label` — `HealthSummaryBar.vue`.

### Server↔Client (P2)

- **REST:** unverändert — Inbox weiter über `notificationsApi` (`El Frontend/src/api/notifications.ts`).
- **WebSocket:** unverändert — `notification_*` vs. `error_event`; UI kommuniziert die Trennung nur in Texten/Labels.

---

## Umsetzung P3 — Polling vs. WebSocket (2026-04-10)

- **Store:** `alert-center.store.ts` — `statsSyncedAt` (ms) nach erfolgreichem `getAlertStats()`; `STATS_POLL_INTERVAL_MS` exportiert; Kommentar P3 im Dateikopf.
- **Store:** `notification-inbox.store.ts` — `inboxLiveTouchedAt` bei REST-Load (`loadInitial`, `loadMore`) und WS (`notification_new`, `notification_updated`, `notification_unread_count`) sowie `applyAlertUpdate`.
- **UI:** `NotificationDrawer.vue` — Zeile „Liste Live (WebSocket). KPI-Tabs: zuletzt …“ (`data-testid="notification-drawer-sync-hint"`); bei `inboxLiveTouchedAt` neuer als `statsSyncedAt` Zusatz „Tab-Zähler können bis zu 30s hinter der Liste liegen.“
- **UI:** `AlertStatusBar.vue` — Screenreader-Text ergänzt: KPI-Intervall vs. WebSocket-Liste.
- **REST / WS:** unveränderte Endpunkte/Events; nur Metadaten-Timestamps + Operator-Text.

---

## P0 — Inventar-Verifikation (Repo-Stand)

- Matrix-Zeilen beziehen sich auf nachgewiesene Pfade unter `El Frontend/src/` (u. a. `Glob`/`Read` zu `AlarmListWidget.vue`, `notification-inbox.store.ts`, `App.vue`).
- Kanonische Ablage: **diese Datei** (`docs/analysen/INVENTAR-frontend-alerts-routen-uiux-2026-04-10.md`).

## Umsetzung P4 (data-testid + Referenz-Playwright)

- **`data-testid` (additiv):** `quick-action-fab-toggle`, `quick-action-item-${action.id}` (QuickActionMenü), `quick-alert-panel`, `quick-alert-back`, `quick-alert-filter-{active|acknowledged|all}`, `quick-alert-batch-ack`, `quick-alert-list`, `quick-alert-row-${id}`, `quick-alert-ack-${id}`, `quick-alert-resolve-${id}`, `quick-alert-empty`, `quick-alert-show-all` — Dateien `El Frontend/src/components/quick-action/QuickActionBall.vue`, `QuickActionMenu.vue`, `QuickAlertPanel.vue`.
- **Playwright:** `El Frontend/tests/e2e/scenarios/alert-center.spec.ts` — Drawer-Tab, Quick-Panel-Sichtbarkeit, **P1:** REST-Mock für `PATCH …/notifications/{id}/acknowledge` → Fehlertoast (`.toast.toast--error`). **Ausführung:** nur mit laufendem Stack sinnvoll; kein „E2E grün“-Claim ohne Lauf.

## Umsetzung dieses Laufs (P0 + P1)

### P1 — Finalität Ack/Resolve (umgesetzt)

- **Store:** `El Frontend/src/shared/stores/alert-center.store.ts` — `acknowledgeAlert`, `resolveAlert`, `resolveAllAlerts` liefern `AlertLifecycleResult`; Fehlerpfad via `toUiApiError` (`El Frontend/src/api/uiApiError.ts`) inkl. optionaler **Request-ID** (`parseApiError`).
- **Einheitliche Texte:** `El Frontend/src/utils/alertLifecycleUi.ts` — `formatAlertLifecycleFailureMessage`.
- **UI:** Fehlertoasts bei `success: false` in `El Frontend/src/components/notifications/NotificationDrawer.vue` (`useToast().show`) und `El Frontend/src/components/quick-action/QuickAlertPanel.vue` (`error` / `warning` inkl. Batch-Ack). **Keine** weiteren direkten Aufrufe von `acknowledgeAlert`/`resolveAlert` im `src/`-Baum außer diesen beiden Oberflächen + Store/API (Grep-basiert).

### Server↔Client (diese UI-Änderungen)

- **REST:** `PATCH …/notifications/{id}/acknowledge`, `PATCH …/resolve`, `POST …/resolve-all` über `notificationsApi` (`El Frontend/src/api/notifications.ts`); Fehlerbody/Status werden in `AlertLifecycleFailure` für Toasts genutzt.
- **WebSocket:** keine neuen Listener; bestehende Kette unverändert — Inbox aktualisiert weiter über `notification_new` / `notification_updated` / `notification_unread_count` (Dispatcher `El Frontend/src/stores/esp.ts`). **error_event** bleibt separat (`notification.store`).

### Verifikation

| Check | Ergebnis |
|-------|----------|
| `npx vue-tsc --noEmit` (Verzeichnis `El Frontend`) | Exit-Code 0 (Stand Umsetzung inkl. P2 + P3) |
| Playwright / E2E | **Nicht** in dieser Session gegen laufenden Stack ausgeführt — kein „E2E grün“-Claim; Szenarien inkl. P1-Ack-Mock: `El Frontend/tests/e2e/scenarios/alert-center.spec.ts`. |

### verify-plan / TASK-PACKAGES

- **Gate erfüllt:** Reality-Check und Report unter `.claude/reports/current/auto-debugger-runs/frontend-alerts-uiux-2026-04-10/VERIFY-PLAN-REPORT.md` (Pfad-/API-Abgleich zum Auftrag, keine BLOCKER).
- Paket-Status konsolidiert: `TASK-PACKAGES.md` im selben Run-Ordner.

---

## Operator-Kurzanleitung (welche UI wann)

| Bedarf | Einstieg |
|--------|----------|
| Inbox lesen, filtern, **Ack/Resolve**, „Alle erledigen“ | TopBar-Glocke / Statusleiste → **NotificationDrawer** |
| Schnell Top-5-Alerts, Batch-Ack, Snooze (Sensor) | FAB → **QuickAlertPanel** |
| Alert-KPIs (MTTA/MTTR, Counts) | **Systemmonitor** → Tab Health / `HealthTab` |
| Transiente Geräte-/Server-Fehler (kein Inbox-Datensatz) | **Toasts** / ggf. Fehlerdetails — Kette **error_event**, nicht Inbox |

---

## Änderungsliste (P1-relevante Artefakte)

- `El Frontend/src/shared/stores/alert-center.store.ts` — `AlertLifecycleResult`, `mapAlertLifecycleError`
- `El Frontend/src/utils/alertLifecycleUi.ts` — gemeinsame Fehlermeldungen
- `El Frontend/src/components/notifications/NotificationDrawer.vue` — Toasts bei Ack/Resolve/Resolve-All
- `El Frontend/src/components/quick-action/QuickAlertPanel.vue` — Toasts inkl. Batch-Ack; **P4:** `data-testid`
- **P4:** `El Frontend/src/components/quick-action/QuickActionBall.vue`, `QuickActionMenu.vue` — `data-testid` FAB + Menüzeilen
- `El Frontend/tests/e2e/scenarios/alert-center.spec.ts` — P4/P1-Referenztests
- Run-Artefakte: `.claude/reports/current/auto-debugger-runs/frontend-alerts-uiux-2026-04-10/` — `FEHLER-REGISTER.md`, `VERIFY-PLAN-REPORT.md`, `TASK-PACKAGES.md`

## Änderungsliste (P2)

- `El Frontend/src/shared/design/primitives/SlideOver.vue` — optionales `subtitle`
- `El Frontend/src/components/notifications/NotificationDrawer.vue` — `subtitle` für Zwei-Ketten-Hinweis
- `El Frontend/src/shared/stores/notification.store.ts` — `Echtzeit ·`-Präfix bei `error_event`-Toasts
- `El Frontend/src/components/notifications/NotificationBadge.vue`, `AlertStatusBar.vue` — Labels
- `El Frontend/src/components/system-monitor/MonitorTabs.vue`, `EventsTab.vue`, `HealthSummaryBar.vue` — Stream vs. Inbox

## Änderungsliste (P3)

- `El Frontend/src/shared/stores/alert-center.store.ts` — `statsSyncedAt`, Export `STATS_POLL_INTERVAL_MS`
- `El Frontend/src/shared/stores/notification-inbox.store.ts` — `inboxLiveTouchedAt`
- `El Frontend/src/shared/stores/index.ts` — Re-Export `STATS_POLL_INTERVAL_MS`
- `El Frontend/src/components/notifications/NotificationDrawer.vue` — Sync-Hinweiszeile (`notification-drawer-sync-hint`)
- `El Frontend/src/components/notifications/AlertStatusBar.vue` — KPI/WS im `aria-label` (Direktimport `STATS_POLL_INTERVAL_MS`)

---

## Akzeptanzkriterien (Auftrag §7 — Mapping)

1. **P0:** Matrix vorliegend; kanonischer Pfad: diese Datei; Pfade durch Repo-Read/Grep belegt.
2. **P1:** Finalität für Ack/Resolve umgesetzt (kein BLOCKER).
3. **P2–P4:** **P2** + **P3** + **P4** umgesetzt (Abschnitte „Umsetzung P2“, „Umsetzung P3“, „Umsetzung P4“); P4 für AlarmListWidget bewusst nicht nötig (Fußnote unter „Status P2–P4“).
4. **Server↔Client:** siehe Abschnitt oben (REST + WS).
5. Keine dritte parallele Hauptnavigation eingeführt.
6. **vue-tsc:** ausgeführt, grün.
7. **Playwright:** keine falsche Grün-Behauptung.
8. **verify-plan:** Report liegt unter `.claude/reports/current/auto-debugger-runs/frontend-alerts-uiux-2026-04-10/VERIFY-PLAN-REPORT.md`.
