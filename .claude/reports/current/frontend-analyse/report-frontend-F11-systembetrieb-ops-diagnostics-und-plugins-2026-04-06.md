# Frontend Analyse F11 - Systembetrieb, Ops, Diagnostics und Plugins

Datum: 2026-04-06  
Scope: `El Frontend/src/views/SystemMonitorView.vue`, `El Frontend/src/components/system-monitor/*`, `El Frontend/src/views/PluginsView.vue`, `El Frontend/src/shared/stores/plugins.store.ts`, `El Frontend/src/api/plugins.ts`, `El Frontend/src/views/LoadTestView.vue`, `El Frontend/src/api/loadtest.ts`, `El Frontend/src/views/SystemConfigView.vue`, `El Frontend/src/views/EmailPostfachView.vue`, `El Frontend/src/composables/useEmailPostfach.ts`, `El Frontend/src/router/index.ts`

---

## 1) Executive Result (IST vs SOLL)

### IST-Staerken
- SystemMonitor ist funktional breit aufgestellt (Events, Logs, DB, MQTT, Health, Diagnostics, Reports, Hierarchy) und routingseitig admin-geschuetzt.
- Fuer einzelne kritische Aktionen gibt es bereits Teil-Guardrails (z. B. 2-Klick-Flow bei Cleanup inkl. Preview im `CleanupPanel`).
- Legacy-Redirects sind konsistent zentral im Router dokumentiert und telemetrierbar (`console.info` bei Legacy-Match).

### IST-Luecken gegen SOLL
- Es gibt **kein einheitliches Ops-Lifecycle-Modell** fuer riskante Aktionen (initiiert, running, partial, success, failed). Status ist je View unterschiedlich und meist nur lokal.
- Lasttest, Plugin-Execution und System-Config-Aenderung haben **keine gemeinsame Impact-Transparenz** (Blast Radius, erwartete Dauer, Rollback, laufende Ausfuehrung).
- Datenfrische ist uneinheitlich: Events/Logs haben Live-/Polling-Indikatoren, andere Ops-Reisen nicht (Plugins, Email, Config).
- Redirect-Ballast ist funktional abgesichert, aber operativ weiterhin hoch (viele Altpfade, teils mit semantischem Drift).

---

## 2) Ops-Hauptreisen (F11.1)

1. **Events (SystemMonitor / events)**  
   Quellen: Aggregated API + WebSocket Live-Stream, Filter, Grouping, Export, Event-Detail -> Log-Korrelation.

2. **Server Logs (SystemMonitor / logs)**  
   Polling (3s), Filter, request_id/time-window Korrelation, CSV-Export, Log-Management.

3. **Database (SystemMonitor / database)**  
   Tabellenexplorer, Sort/Filter/Pagination, Record-Detail, JSON-Export.

4. **Diagnostics (SystemMonitor / diagnostics)**  
   Voll-Diagnose und Single-Check Trigger mit Report/History.

5. **Plugins (PluginsView)**  
   Plugin enable/disable, execute, config update, execution history.

6. **LoadTest (LoadTestView)**  
   Bulk Mock-ESP Create, Simulation Start/Stop, Metrics-Refresh.

7. **Email (EmailPostfachView)**  
   Email-Log Monitoring inkl. Status/Retry/Detail/Stats (read-only).

8. **System Config (SystemConfigView)**  
   Runtime-Konfig laden, anzeigen, edit/save (non-secret), secret visibility toggle.

---

## 3) Matrix: Ops-Aktion -> Side Effect -> aktuelle Transparenz -> Risiko (F11 Nachweis)

| Ops-Aktion | Side Effect | Aktuelle Transparenz | Risiko |
|---|---|---|---|
| Event-Stream pausieren/fortsetzen | Verpasste Live-Events waehrend Pause, spaeter Reload | Pause-Badge vorhanden, kein Gap-Delta | M |
| Cleanup dry-run + final delete (`CleanupPanel`) | Permanentes Loeschen Audit-Events, optional Backup | Gute Preview + 2-Klick + Result-Card | M |
| Backup restore (`CleanupPanel`) | Historische Event-Wiederherstellung, potenzielle Daten-Ueberschreibung | Laufstatus je Backup-Button, kein globaler Job-Lifecycle | H |
| Backup delete (`CleanupPanel`) | Entfernt Restore-Option | Button-Spinner je Backup, kein Undo | M |
| Retention config save (`CleanupPanel`) | Aendert kuenftige Auto-Cleanup-Strategie | Kein Dry-Run Impact vor Save | H |
| Backup retention save (`CleanupPanel`) | Aendert Ablaufregeln fuer Backups | Nur Save-Status, keine Risikoaufklaerung | M |
| Logs live polling an/aus | Datenfrische-Shift, pot. stale logs | Live-Indikator vorhanden | L |
| Logs clear (UI) | Nur UI-Buffer reset, keine Server-Seite | Klar erkennbare lokale Aktion | L |
| DB export JSON | Datenabfluss lokal (Download) | Direkter Button, kein Datenschutz-Hinweis | M |
| Diagnostics full run | Last auf Server/Checks, evtl. Laufzeitspitzen | isRunning/runningCheck sichtbar, kein globaler Progress-Status | M |
| Diagnostics single check | Punktuelle Last, partielle Ergebnislage | Check-card spinner/status sichtbar | L-M |
| Plugin execute | Pot. Side Effects im Ops-System je Plugin | Nur lokale Toast + History nach Reload; kein Live-Lifecycle | H |
| Plugin enable/disable | Aendert Betriebsverhalten regel-/zeitgesteuerter Jobs | Toast + State-Flip, keine Impact-Zusammenfassung | H |
| Plugin config update | Aendert Runtime-Verhalten bei naechster Ausfuehrung | Save-Toast, kein Diff/Impact-Hinweis | H |
| LoadTest bulk-create | Viele Mock-Geraete + Datenlast | Erfolg/Fehler-Toast, kein Pre-Impact | H |
| LoadTest start simulation | Kontinuierliche Last auf API/WS/MQTT/DB | Sim-Status lokal + Metrics polling | H |
| LoadTest stop simulation | Lastabbau, potenzieller Nachlauf | Lokaler Status sichtbar | M |
| SystemConfig save | Aendert produktionsnahe Runtime-Konfiguration | Minimaler Erfolgstext, kein "pending apply"/source-of-truth status | H |
| Email Log Filter/Pagination | Keine Seiteneffekte (read-only) | Solide Lade-/Fehler-/Pagination-Anzeige | L |

Legende Risiko: L = niedrig, M = mittel, H = hoch.

---

## 4) Nebenwirkungs- und Risiko-Hotspots pro Reise (F11.2)

### A) Hoechste Hotspots
1. **Plugins**: execute/toggle/config ohne standardisierte Lifecycle-Anzeige und ohne explizite Impact-Kommunikation.
2. **LoadTest**: Laststeigerung durch Bulk+Simulation ohne Guardrail-Vorstufe (Warnstufe, Limits, Rollback-Hinweis).
3. **System Config**: Save-Flow ohne strukturierte Risiko- und Finalitaetsanzeige (initiiert/running/partial/...).
4. **Cleanup Restore/Retention**: technisch stark, aber ohne konsolidierten globalen Job-Status und ohne "partial" Semantik.

### B) Mittlere Hotspots
- Logs/Events Datenfrische: lokal transparent, aber nicht systemweit standardisiert.
- DB Export: kein Hinweis auf Sensitivitaet/Scope/Size vor Export.

### C) Niedrige Hotspots
- Email-Postfach: ueberwiegend observability/read-only.

---

## 5) Plugin-Execution-Lifecycle Spezifikation (F11.3)

### Ziel
Ein einheitlicher, sichtbarer Ausfuehrungslifecycle fuer Plugin-Aktionen mit **Execution-ID** und Statuskanal.

### 5.1 Contract (Frontend-SOLL)
- **Execution-ID (Pflicht):** jede manuelle oder automatische Plugin-Ausfuehrung erhaelt `execution_id`.
- **Statusmodell (vereinheitlicht):**
  - `initiated` (Frontend hat Trigger gesendet, Awaiting Acceptance)
  - `running` (Server bestaetigt Start)
  - `partial` (Substeps teilweise erfolgreich, noch nicht terminal)
  - `success` (terminal erfolgreich)
  - `failed` (terminal fehlgeschlagen)
  - optional intern weiterfuehrbar: `timeout`, `cancelled` -> auf UI als `failed` mit reason.
- **Statuskanal:** WebSocket Event `plugin_execution_status` mit payload:
  - `execution_id`, `plugin_id`, `status`, `progress_percent?`, `step?`, `message`, `started_at`, `updated_at`, `finished_at?`, `error_code?`, `error_message?`, `triggered_by`, `correlation_id?`.

### 5.2 UI-Verhalten
- **PluginCard + Detail + History** zeigen denselben Lifecycle-State pro `execution_id`.
- **Global Ops Banner/Queue** (im SystemMonitor/Ops Header) zeigt laufende riskante Aktionen systemweit.
- **Timeout-Guard:** wenn nach `initiated` binnen N Sekunden kein `running` -> auto `failed` mit "server did not acknowledge".
- **Reconciliation:** bei Tab-Wechsel/Reload active executions per REST (`GET /plugins/executions?status=running`) nachladen.

### 5.3 Datenmodell-Alignment zur aktuellen Codebasis
- Bestehende DTO `PluginExecutionDTO` hat bereits `id`, `status`, `started_at`, `finished_at`, `duration_seconds`, `error_message`.
- Aktuell fehlt: `initiated/partial` plus Live-Status-Transport (WS) und einheitliche Darstellung waehrend Ausfuehrung.

---

## 6) Guardrails fuer Lasttest und System-Config als UX-Standard (F11.4)

### 6.1 Standard-Pattern "Risk Action Guardrail"
Jede riskante Aktion folgt demselben 4-Stufen-Muster:

1. **Preflight**  
   Zeigt vor Ausfuehrung:
   - erwarteter Impact (z. B. +N Mock-ESPs, erwartete Msg/s, betroffene Module),
   - aktuelle Systemauslastung (sofern verfuegbar),
   - Abbruch-/Rollback-Option.

2. **Confirm mit Intent**  
   - explizite Confirmation mit Aktionstext (kein generisches "OK"),
   - bei High-Risk optional typed confirm (z. B. `START LOADTEST`).

3. **Lifecycle-Tracking**  
   - Status: initiated -> running -> partial|success|failed,
   - Fortschritt/Teilschritte sichtbar,
   - Correlation/Execution-ID copybar.

4. **Post-Action Summary**  
   - Was wurde tatsaechlich geaendert?
   - Welche Nebenwirkungen wurden beobachtet?
   - Naechster sicherer Schritt (z. B. stop simulation, revert config).

### 6.2 Konkrete Guardrails Lasttest
- Hard Limits im UI:
  - `bulkCount` max konfigurierbar via server capability, nicht statisch nur Input-Max.
  - Forecast: "Diese Aktion erzeugt ca. X Sensoren / Y Aktoren / Z msg/min".
- Start nur nach Preflight:
  - Broker verbunden?
  - WS gesund?
  - Optional "production-like mode" Block.
- "Kill switch" immer sichtbar waehrend laufender Simulation.

### 6.3 Konkrete Guardrails System-Config
- Vor Save:
  - key-diff (old -> new),
  - Risiko-Klasse pro Key (low/medium/high),
  - "requires restart/reload?" explizit anzeigen.
- Nach Save:
  - getrennte Zustaende: `saved` (persistiert) vs `applied` (runtime uebernommen),
  - wenn nur `saved`: klarer Hinweis auf ausstehenden Apply-Schritt.

---

## 7) Legacy-Redirects: Vollstaendige Liste + Priorisierung (F11 Nachweis)

Quelle: `El Frontend/src/router/index.ts`

### 7.1 Liste
1. `/monitor/dashboard/:dashboardId` -> `/editor/:dashboardId`
2. `/custom-dashboard` -> `/editor`
3. `/dashboard-legacy` -> `/hardware`
4. `/devices` -> `/hardware`
5. `/devices/:espId` -> `/hardware?openSettings=:espId`
6. `/mock-esp` -> `/hardware`
7. `/mock-esp/:espId` -> `/hardware?openSettings=:espId`
8. `/database` -> `/system-monitor?tab=database`
9. `/logs` -> `/system-monitor?tab=logs`
10. `/audit` -> `/system-monitor?tab=events`
11. `/mqtt-log` -> `/system-monitor?tab=mqtt`
12. `/maintenance` -> `/system-monitor?tab=health`
13. `/actuators` -> `/sensors?tab=actuators`
14. `/sensor-history` -> `/monitor`

### 7.2 Priorisierung fuer Aufraeumen
- **P1 (hoch, hoher operativer Drift):** `devices*`, `mock-esp*`, `database`, `logs`, `audit`, `mqtt-log`, `maintenance`
- **P2 (mittel, UX-Kontextwechsel):** `monitor/dashboard/:dashboardId`, `sensor-history`
- **P3 (niedriger, semantisch naheliegend):** `custom-dashboard`, `dashboard-legacy`, `actuators`

### 7.3 Decommission-Schritte (klar und sicher)
1. **Messphase (2-4 Wochen):** Redirect-Nutzung zaehlen (bestehendes Legacy-Logging ausbauen auf zentrales Metric Event).
2. **Warnphase:** In-App Banner fuer Nutzer mit Legacy-Einstieg (inkl. Zielpfad-Hinweis).
3. **Soft-Removal:** P3 entfernen, P1/P2 behalten.
4. **Hard-Removal:** P2 entfernen, danach P1 sobald Nutzung unter Schwellwert.
5. **Fallback:** Catch-all bleibt fuer not-found safety.

---

## 8) Akzeptanzkriterien-Check gegen Auftrag

### Kritische Ops-Aktionen haben sichtbaren Laufzeitstatus
- **Teilweise erfuellt** (z. B. Diagnostics running, Loadtest local status, Cleanup progress lokal).
- **Nicht erfuellt als Standard** (kein einheitlicher Lifecycle ueber alle High-Risk-Aktionen).

### Lasttest-/Config-Pfade mit klaren Schutzmechanismen
- **Nicht ausreichend erfuellt**: Basisvalidierung vorhanden, aber kein Guardrail-Standard (Preflight/Impact/Rollback/Lifecycle-Standard fehlt).

### Redirect-Ballast in Decommission-Schritten geplant
- **Erfuellt durch diesen Bericht**: komplette Liste, Priorisierung und stufenweiser Abbauplan vorhanden.

---

## 9) Test-/Nachweis-Plan (aus Auftrag abgeleitet)

### E2E: Admin-Ops-Reise mit Fehlerpfad
- Flow: `/system-monitor` -> Cleanup dry-run -> Confirm -> injected failure -> failed state + klarer Recovery-Hinweis.
- Assertions:
  - Lifecycle sichtbar (`initiated/running/failed`),
  - side-effect summary vorhanden,
  - keine silent failure.

### Integration: Plugin execution status flow
- Simuliere `executePlugin` + Statusevents:
  - initiated -> running -> partial -> success
  - initiated -> failed (timeout/no ack)
- Assertions:
  - konsistente `execution_id` in Card/Detail/History,
  - Reconciliation nach reload (running executions werden wiederhergestellt).

---

## 10) Konkrete F11-Umsetzungsprioritaet (Empfehlung)

1. **Ops Lifecycle Contract als shared TS model** (`initiated/running/partial/success/failed`) + shared UI-Badge/Banner.
2. **Plugin Execution Channel** (execution_id + status stream) als erstes Referenz-Feature.
3. **LoadTest Guardrail Modal** (Impact Forecast + typed confirm + kill-switch visibility).
4. **SystemConfig Save Guardrail** (Diff + Risiko-Klasse + saved vs applied).
5. **Redirect Telemetrie verfeinern** und Decommission mit P3 starten.

