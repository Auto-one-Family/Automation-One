# Report F11: Systembetrieb, Ops, Diagnostics, Plugins

Datum: 2026-04-05  
Scope: `El Frontend/src/views/SystemMonitorView.vue`, `El Frontend/src/components/system-monitor/*`, `El Frontend/src/components/database/*`, `El Frontend/src/views/PluginsView.vue`, `El Frontend/src/views/SystemConfigView.vue`, `El Frontend/src/views/LoadTestView.vue`, `El Frontend/src/views/EmailPostfachView.vue`, `El Frontend/src/composables/useEmailPostfach.ts`, `El Frontend/src/shared/stores/plugins.store.ts`, `El Frontend/src/shared/stores/database.store.ts`, `El Frontend/src/shared/stores/diagnostics.store.ts`, `El Frontend/src/api/{audit,logs,database,diagnostics,plugins,config,loadtest,notifications,debug}.ts`, `El Frontend/src/router/index.ts`

## 1) Executive Result

- Der `SystemMonitor` ist als zentraler Ops-Hub sauber konsolidiert (8 Tabs), mit klarer Trennung zwischen Event-Stream, Logs, DB-Explorer, Health, Diagnostics, Reports und Hierarchie.
- Die Datenwege sind fuer die Kerntabs nachvollziehbar: UI-Filter -> REST/WS -> tab-spezifische Renderpfade. Insbesondere Events/Logs sind gut instrumentiert.
- Admin-Flaechen (`Plugins`, `SystemConfig`, `LoadTest`, `Email`) sind routingseitig durch `requiresAdmin` abgesichert; Bedienfluss und Fehlerfeedback sind vorhanden, aber in der Tiefe uneinheitlich robust.
- Legacy-Redirects sind zahlreich, aber funktional konsistent auf die neuen Zielpfade gebogen; es gibt jedoch operativen Ballast durch alte Einfallstore und uneinheitliche Redirect-Semantik.
- Hauptbetriebsrisiken liegen nicht in fehlenden APIs, sondern in fehlender Nebenwirkungs-Transparenz (z. B. Plugin-Execution ohne Laufzeitstatuskanal), teilweiser Fehler-Granularitaet und nicht immer explizit sichtbarer Datenfrische.

---

## 2) Tab- und Datenquellenkarte System Monitor (Pflicht 1)

## 2.1 Tab-Inventar (8 Haupttabs)

`MonitorTabs` definiert:
- `events` (Ereignisse)
- `logs` (Server Logs)
- `database` (Datenbank)
- `mqtt` (MQTT Traffic)
- `health` (Health)
- `diagnostics` (Diagnose)
- `reports` (Reports)
- `hierarchy` (Hierarchie)

`SystemMonitorView` liest initial `route.query.tab` und setzt `activeTab` entsprechend.

## 2.2 Datenquellen je Tab

| Tab | Primaerquelle | Realtime/Refresh | Rendering |
|---|---|---|---|
| `events` | `auditApi.getAggregatedEvents(...)` (`audit_log`, `sensor_data`, `esp_health`, `actuators`) | WS-Sub auf `WS_EVENT_TYPES` + `events_restored` | `EventsTab` -> `UnifiedEventList` |
| `logs` | `logsApi.queryLogs(...)`, `logsApi.listFiles()` | optional Polling (3s) | `ServerLogsTab` |
| `database` | `databaseApi.listTables/queryTable/getRecord` via `database.store` | kein WS, explizites Refresh/Pagination/Sort | `DatabaseTab` + `DataTable` |
| `mqtt` | WS-Events (`sensor_data`, `actuator_status`, `esp_health`, ...) | live stream, lokaler Buffer `MAX_MESSAGES=1000` | `MqttTrafficTab` |
| `health` | `getFleetHealth()`, `debugApi.getMaintenanceStatus/config`, `diagStore`/`alertStore` | Polling im Alert-Store + manuelle Wartungs-Trigger | `HealthTab` |
| `diagnostics` | `diagnosticsApi` via `diagnostics.store` | on-demand Runs | `DiagnoseTab` |
| `reports` | `diagnosticsApi.getHistory/getReport/export` via `diagnostics.store` | manuelles Reload | `ReportsTab` |
| `hierarchy` | `GET /kaiser/god/hierarchy` (direkt via `api/index`) | manuelles Refresh | `HierarchyTab` |

## 2.3 Query-/Deep-Link-Matrix

- `SystemMonitorView` konsumiert:
  - `?tab=...`
  - `?timeRange=...`
  - `?esp=...` (watch mit `immediate: true`)
- Log-Korrelation:
  - aus Event-Details via `request_id` oder Zeitfenster (`logsStartTime/logsEndTime`) auf Tab `logs`.
- `EmailPostfachView` verlinkt Detaileintrag mit `notification_id` nach `/system-monitor?tab=events`.

---

## 3) Eventgruppen und Ops-Abhaengigkeiten (Pflicht 2)

## 3.1 Eventgruppen (fachlich)

In `SystemMonitorView` entstehen drei relevante Gruppen:

1. **Historische Aggregat-Events**  
   `auditApi.getAggregatedEvents(...)` liefert multi-source Eventpakete.

2. **Live-WebSocket-Events**  
   `useWebSocket` sub auf `WS_EVENT_TYPES`; Umwandlung in `UnifiedEvent` inkl. Contract-Checks (`validateContractEvent`, `buildContractIntegritySignal`).

3. **Spezial-Events**  
   `events_restored` triggert Highlighting restaurierter Event-IDs + Reload von Historie/Statistik.

## 3.2 Abhaengigkeiten in Ops-Flows

- **Event -> Logs Korrelation**
  - `EventDetailsPanel`/Handler setzt `logsRequestId` oder Zeitfenster.
  - Tab-Wechsel auf `logs` zeigt korrelierte Server-Logs.
- **Cleanup/Retention -> Eventbestand**
  - `CleanupPanel` Erfolg -> `handleCleanupSuccess()` -> `loadStatistics()` + `loadHistoricalEvents()`.
- **Health -> Alerts/Diagnose/Wartung**
  - `HealthTab` kombiniert `getFleetHealth`, `alertStore` Polling, `diagStore` Quick-Diagnose, `debugApi` Maintenance-Jobs.
- **Email -> Events**
  - E-Mail-Logeintrag mit Notification-Link springt direkt in den Events-Tab.

Bewertung: Die Abhaengigkeiten sind explizit kodiert und keine "stille Magie", aber stark komponentenverteilt (View + mehrere Stores).

---

## 4) Rechte, Failure-Pfade, Nebenwirkungen (Pflicht 3)

## 4.1 Zentrale Rechtekontrolle

- Router-Guard:
  - `to.meta.requiresAdmin && !authStore.isAdmin` -> Redirect auf `hardware`.
- Admin-Routen:
  - `/system-monitor`, `/plugins`, `/system-config`, `/load-test`, `/email`.

### Risiko (mittel): UI-Redirect statt explizitem 403-Kontext
- Nicht-Admins landen stumm auf `hardware`; kein "Zugriff verweigert"-Kontext.
- Operativ bei Supportfaellen schwerer nachvollziehbar ("Seite fehlt" statt "kein Recht").

## 4.2 Plugins (`PluginsView` + `plugins.store`)

**Flow**
1. Auswahl Plugin -> `fetchPluginDetail` + `fetchHistory`.
2. Trigger Execute -> `pluginsApi.execute(/plugins/{id}/execute)`.
3. Danach Refresh der Pluginliste und optional Detail/History.

**Failure-Pfade**
- API-Fehler landen als Toast im Store.
- View hat keine separate Error-State-Fläche pro Teilschritt.

**Nebenwirkungen**
- Plugin-Execution kann serverseitig Jobs ausloesen; im UI nur indirekt als Erfolgstext/History sichtbar.

### Risiko (hoch): Kein dedizierter Laufzeit-/Zwischenstatus im View
- `executePlugin` ist request-basiert; laufende serverseitige Wirkung wird nicht live getrackt (kein WS-Execution-State in der View).
- Bei langen/teilasynchronen Plugins ist "ausgeführt: status" operativ zu grob.

## 4.3 SystemConfig (`SystemConfigView` + `configApi`)

**Flow**
1. `loadConfigs()` via `/debug/config`.
2. Edit (nur `!is_secret`) -> `PATCH /debug/config/{key}`.
3. Reload + Success-Banner.

**Failure-Pfade**
- API-Error wird angezeigt (`error` Alert).
- Secret-Werte sind maskiert, optional sichtbar schaltbar.

### Risiko (mittel): Wirkungsraum-Kontext fehlt
- Konfig-Write ist moeglicherweise systemweit/sicherheitsrelevant, aber UI liefert kaum Hinweise zu Scope, Rollback oder betroffenen Diensten.

## 4.4 LoadTest (`LoadTestView` + `loadTestApi`)

**Flow**
- Bulk Create: `/debug/load-test/bulk-create`
- Sim Start: `/debug/load-test/simulate`
- Sim Stop: `/debug/load-test/stop`
- Metrics: `/debug/load-test/metrics`

**Failure-Pfade**
- Fehlerbanner + Success-Banner vorhanden.
- Interval-Cleanup in `onUnmounted` sauber.

**Nebenwirkungen**
- Erzeugt aktiv Last/MQTT-Traffic und veraendert Betriebsbild (Mock-ESP Menge, Published Messages).

### Risiko (hoch): Kein expliziter Safeguard fuer produktionsnahe Umgebungen
- UI bietet keine harte Warnung/Bestätigung vor Laststart.
- Besonders kritisch, wenn Admin-Rolle in gemischten Umgebungen breit vergeben ist.

## 4.5 EmailPostfach (`EmailPostfachView` + `useEmailPostfach`)

**Flow**
1. Laden Log + Stats via `notificationsApi.getEmailLog/getEmailLogStats` (admin only).
2. Filter + Pagination im Composable (`watch(filters)` auto-reload).
3. Detail-SlideOver inkl. Fehler-/Retry-Info und Link zu Events.

**Failure-Pfade**
- ErrorState mit Retry für Logliste.
- Stats-Fail degradiert still auf `null` (kein harter Fehler).

### Risiko (niedrig-mittel): Stats-Degradation ohne sichtbaren Grund
- Bei Stats-Fehlern bleibt nur der Listenteil; fuer Ops fehlt ein klarer Hinweis "Statistik derzeit nicht verfuegbar".

---

## 5) Legacy-Redirects und operative Folgen (Pflicht 4)

## 5.1 Gefundene Redirects (Auszug)

- `/database` -> `/system-monitor?tab=database`
- `/logs` -> `/system-monitor?tab=logs`
- `/audit` -> `/system-monitor?tab=events`
- `/mqtt-log` -> `/system-monitor?tab=mqtt`
- `/maintenance` -> `/system-monitor?tab=health`
- `/custom-dashboard` -> `/editor`
- `/devices`, `/mock-esp*`, `/dashboard-legacy` -> `/hardware`
- `/sensor-history` -> `/monitor`
- `/monitor/dashboard/:dashboardId` -> `/editor/:dashboardId`

## 5.2 Operative Folgen

- **Positiv**: Alte Bookmarks funktionieren weiter, Nutzer werden auf konsolidierte Oberflächen gebracht.
- **Negativ**:
  - Mehrere "historische Einstiegspunkte" erschweren Support-Diagnose ("welcher Pfad war urspruenglich gemeint?").
  - Semantische Unterschiede gehen verloren (z. B. alter View-Kontext vs. neuer Tab-Kontext).

## 5.3 Cleanup-Vorschlag

1. Redirect-Telemetrie erheben (Hit-Rate je Legacy-Route, 30 Tage).
2. Routen mit `0` Nutzung markieren und in einer Welle entfernen.
3. Fuer verbleibende Redirects sichtbare Ziel-Banner/Toast ("Diese Seite wurde konsolidiert nach ...").
4. Dokumentations-Hinweise (`README`, User-Docs, Admin-Playbooks) auf neue SSOT-Pfade vereinheitlichen.

---

## 6) Pflichtnachweise

## 6.1 Nachweis A: Tab-/Filteraktion -> Query/Realtime -> Rendering

### A1 Events-Tab (Filter + API + Render)
1. User aendert DataSource/Severity/ESP in `DataSourceSelector`.
2. `SystemMonitorView` aktualisiert Filterstate (`selectedDataSources`, `filterLevels`, `filterEspId`).
3. Debounced Watch triggert `loadHistoricalEvents()` -> `auditApi.getAggregatedEvents(...)`.
4. Ergebnis wird als `UnifiedEvent[]` transformiert.
5. `EventsTab` rendert via `UnifiedEventList` (inkl. Gruppierung).

### A2 Events-Tab (Realtime)
1. WS-Event trifft ein (`on(eventType, handleWebSocketMessage)`).
2. Mapping/Contract-Validation in `transformToUnifiedEvent`.
3. Event wird in `unifiedEvents` eingefuegt.
4. `filteredEvents/groupedEvents` recalculieren.
5. `UnifiedEventList` rendert live neu.

### A3 Logs-Tab (Filter -> Query -> Render)
1. User setzt Level/Modul/Search/Request-ID/Zeitfenster.
2. `currentQueryParams` computed.
3. `logsApi.queryLogs(...)`.
4. `ServerLogsTab` rendert Ergebnisliste, optional Polling-Refresh alle 3s.

## 6.2 Nachweis B: Admin-Trigger -> Serverprozess -> Status-/Ergebnisanzeige

### B1 Plugin-Ausfuehrung
1. Trigger: "Ausführen" in `PluginsView`.
2. Request: `POST /plugins/{id}/execute`.
3. Nachlauf: `fetchPlugins` + optional `fetchHistory`.
4. UI: Toast + aktualisierte Historie/Last-Execution im Detail.

### B2 Wartungsjob aus Health-Tab
1. Trigger: manueller Job (`triggerMaintenanceJob(jobId)`).
2. Request: `POST /debug/maintenance/trigger/{jobId}`.
3. Nachlauf: `loadMaintenanceData()`.
4. UI: Success/Error Toast + aktualisierter Wartungsstatus.

### B3 Load-Test-Simulation
1. Trigger: Start/Stop in `LoadTestView`.
2. Requests: `/debug/load-test/simulate` bzw. `/debug/load-test/stop`.
3. Nachlauf: Metrics-Refresh (`/debug/load-test/metrics`) + Intervallsteuerung.
4. UI: Sim-Statusindikator + Success/Error Banner + KPI-Karten.

---

## 7) Sicherheits- und Bedienrisikobewertung je Admin-Flaeche

| Flaeche | Sicherheitsrisiko | Bedienrisiko | Gesamt |
|---|---|---|---|
| `SystemMonitor` | mittel (breite Einsicht in Betriebsdaten, Cleanup-Aktionen) | mittel | mittel |
| `Plugins` | hoch (potenziell operative Server-Aktionen) | mittel-hoch (Statustransparenz begrenzt) | hoch |
| `SystemConfig` | hoch (globale Konfigaenderung) | mittel (fehlender Impact-/Rollback-Kontext) | hoch |
| `LoadTest` | hoch (aktive Lastgenerierung) | hoch (kein harter "Are you sure?"-Guard) | hoch |
| `EmailPostfach` | niedrig-mittel (sensible Empfaenger-/Fehlerdaten sichtbar) | niedrig-mittel | mittel |

---

## 8) Priorisierte Befunde und Empfehlungen

## Hoch: R1 - LoadTest ohne starke Betriebsbremse
- Befund: Start/Stop direkt klickbar, keine zweite Sicherheitsabfrage.
- Empfehlung: ConfirmDialog + Umgebungshinweis (z. B. "nur DEV/STAGING"), optional Feature-Flag serverseitig.

## Hoch: R2 - Plugin-Execution ohne klaren Runtime-Lifecycle im View
- Befund: Ergebnis vor allem als Toast/History; laufende Zustandskette fehlt.
- Empfehlung: Execution-Status-Stream (WS oder Polling) + pro Execution-ID sichtbarer Fortschritt.

## Mittel: R3 - Config-Write ohne Impact/Side-Effect Preview
- Befund: `PATCH` moeglich, aber UI erklärt Auswirkungen nicht.
- Empfehlung: "Betroffene Subsysteme" anzeigen, confirm bei kritischen Keys, optional Audit-Hinweis im UI.

## Mittel: R4 - Legacy-Redirect-Ballast
- Befund: viele alte Pfade bleiben aktiv.
- Empfehlung: Redirect-Telemetrie + deprecate/remove Plan in 2 Wellen.

## Niedrig-Mittel: R5 - Stats-Teilfehler in Email/Diagnostics teils still
- Befund: Teilausfaelle werden nicht immer explizit als degradierter Zustand markiert.
- Empfehlung: partielle Error-Badges ("Statistik derzeit nicht verfuegbar").

---

## 9) Akzeptanzkriterien-Abgleich

- Jede Admin-Flaeche hat Sicherheits- und Bedienrisikobewertung: **erfuellt** (Abschnitt 7).
- Legacy-Pfade sind mit Cleanup-Vorschlag versehen: **erfuellt** (Abschnitt 5.3).
- Pflichtnachweise (Tab/Filter -> Query/Realtime -> Rendering, Admin-Trigger -> Serverprozess -> Ergebnisanzeige): **erfuellt** (Abschnitt 6).

## 10) Kurzfazit

Der Frontend-Ops-Bereich ist funktional stark konsolidiert und technisch gut verdrahtet. Fuer einen robusten Systembetrieb fehlt weniger Featureumfang als vielmehr "operative Sicherheits-UX": klare Guardrails bei wirksamen Admin-Aktionen, transparentere Laufzeitstatus bei Plugin/Wartung/Last und geplanter Abbau der Legacy-Einstiegspfade.

