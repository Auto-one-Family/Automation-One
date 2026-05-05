# SI-8 — DiagnosticsView: Forensik-Schicht Inventar und Kanon

> **Issue:** AUT-245
> **Parent:** Frontend-Konsolidierung 2026
> **Datum:** 2026-05-06
> **Modus:** Read-only Inventar + Kanon-Festlegungen — keine Implementierung

---

## Executive Summary

Eine dedizierte `DiagnosticsView.vue` existiert nicht. Die Forensik-Funktionalität ist vollständig in `SystemMonitorView.vue` (Route `/system-monitor`) verteilt, aufgeteilt in acht Tabs (`types.ts`: `TabId`). Die diagnostics-relevanten Tabs sind `health`, `diagnostics`, `reports` — betrieben von drei Stores und einer vollständig implementierten REST-API (`/v1/diagnostics/*`).

Kritischer Befund: Das WS-Event `esp_diagnostics` (von `DiagnosticsHandler` auf Server gesendet) ist **nirgendwo im Frontend abonniert**. Es existiert kein WS-Event-Typ-Eintrag für `esp_diagnostics` in `websocket-events.ts` und kein Handler in `contractEventMapper.ts` oder `esp.ts`. Der `esp_health`-Stream (Heartbeat-basiert) ist hingegen vollständig verdrahtet. Die Heartbeat-Ampel (`useESPStatus.ts`) nutzt `last_seen`/`last_heartbeat`, aber die Schwellen stimmen nicht mit dem kanonischen 60s-Intervall überein.

---

## 1. Inventar-Tabelle

| Komponente | Pfad | Zweck | Datenquelle | WS-Event | Status |
|---|---|---|---|---|---|
| `SystemMonitorView.vue` | `El Frontend/src/views/SystemMonitorView.vue` | Host der 8 Tabs inkl. Forensik-Tabs | Alle unten | `esp_health`, `sensor_health`, `error_event`, `lwt_received` (via `WS_EVENT_TYPES`) | Implementiert, kein Diagnostics-WS |
| `DiagnoseTab.vue` | `El Frontend/src/components/system-monitor/DiagnoseTab.vue` | 10 Check-Karten (manuell ausloesbar) | `POST /v1/diagnostics/run`, `GET /v1/diagnostics/checks` | Keines — pure REST-Poll | Implementiert (Phase 4D.2.3) |
| `HealthTab.vue` | `El Frontend/src/components/system-monitor/HealthTab.vue` | Fleet-Health-Uebersicht: Online-Count, Heap, RSSI, Problem-Geraete | `GET /v1/health/esp` (`getFleetHealth`), `debugApi` (Maintenance), `diagStore` (letzte Diagnose) | Indirekt via `diagStore` | Implementiert, Maintenance-Jobs verankert |
| `ReportsTab.vue` | `El Frontend/src/components/system-monitor/ReportsTab.vue` | Report-Verlauf, Detail-Expand, Markdown-Export | `GET /v1/diagnostics/history`, `GET /v1/diagnostics/history/{id}`, `POST /v1/diagnostics/export/{id}` | Keines | Implementiert (Phase 4D.2.4) |
| `HealthSummaryBar.vue` | `El Frontend/src/components/system-monitor/HealthSummaryBar.vue` | Kompakt-Leiste: Offline-Geraete, Heap, RSSI, Alerts | `diagStore`, `alertStore`, `inboxStore` | Keines — computed aus Stores | Implementiert |
| `diagnostics.store.ts` | `El Frontend/src/shared/stores/diagnostics.store.ts` | Diagnose-Run, History, Export, Available Checks | `El Frontend/src/api/diagnostics.ts` | Keines | Implementiert, kein WS-Update |
| `diagnostics.ts` (API) | `El Frontend/src/api/diagnostics.ts` | REST-Client fuer alle Diagnostics-Endpunkte | Server `/v1/diagnostics/*` | — | Vollstaendig implementiert |
| `audit.ts` (API) | `El Frontend/src/api/audit.ts` | Audit-Log-Zugriff inkl. Paginierung, Aggregation, Corr.-Events, Retention | Server `/v1/audit/*` | — | Vollstaendig implementiert |
| `espHealth.ts` (Domain) | `El Frontend/src/domain/esp/espHealth.ts` | Normalisierung + Presentation-Logik fuer `esp_health`-WS-Payload | WS `esp_health` | `esp_health` | Implementiert (AUT-124) |
| `useESPStatus.ts` | `El Frontend/src/composables/useESPStatus.ts` | Status-Ampel aus last_seen/status (reaktive Timer-Ticks) | `esp_health` WS → `esp.ts` Store | — | Implementiert, **falsche Schwellen** (siehe Kanon) |
| `AlertAuditLines.vue` | `El Frontend/src/components/notifications/AlertAuditLines.vue` | Audit-Log-Zeilen in Notification-Kontext | `audit.ts` | — | Implementiert, Scope begrenzt |

### Nicht vorhanden

- Kein `DiagnosticsView.vue` als eigenstaendige Route.
- Kein Frontend-Abonnement fuer WS-Event `esp_diagnostics` (weder in `contractEventMapper.ts`, `websocket-events.ts` noch `esp.ts`).
- Kein dedizierter Heartbeat-Log-Viewer fuer `esp_heartbeat_logs` (Tabelle vorhanden, Repo `esp_heartbeat_repo.py` vorhanden, aber kein REST-Endpoint `/v1/esp/{id}/heartbeat-logs` exponiert).
- Kein REST-Endpoint fuer direkten Zugriff auf `esp_heartbeat_logs` aus dem Frontend (wird nur intern von `event_aggregator_service.py` fuer den aggregierten Event-Feed genutzt).

---

## 2. Kanon-Entscheidungen

### 2.1 Heartbeat-Status-Ampel

Aktueller Ist-Stand in `useESPStatus.ts`:

```
HEARTBEAT_STALE_MS  = 90_000   (1.5x 60s = 90s)  → "Verzögert"
HEARTBEAT_OFFLINE_MS = 210_000 (3.5 Minuten)       → "Offline" (Fallback)
```

Diese Schwellen sind nicht mit dem 60s-Heartbeat-Intervall und der Server-LWT-Lücke abgestimmt. Der Server erkennt Timeout nach ~120s (heartbeat_handler, AUT-122). Frontend sollte diese Grenze widerspiegeln.

**Kanon-Festlegung (AUT-245):**

| Zustand | Schwelle | Anzeige | Token |
|---|---|---|---|
| Gruen (fresh) | last_seen <= 70s alt | "Online" | `var(--color-success)` |
| Gelb (stale) | 70s < last_seen <= 120s | "Verzögert" | `var(--color-warning)` |
| Rot (offline) | last_seen > 120s ODER `status = 'offline'` | "Offline" | `var(--color-error)` |

Begruendung: 70s = 60s Intervall + 10s Toleranz. 120s = Server-Timeout-Grenze. Oberhalb 120s sollte der Server bereits LWT ausgeloest haben. Das Frontend darf also bei >120s eigenstaendig auf "Offline" schalten (Fallback fuer Server-Crash ohne LWT, der erst nach ~120s erkennbar ist).

**Vorsicht:** `HEARTBEAT_OFFLINE_MS = 210_000` ist zu lang — ein 3.5-Minuten-Stale gibt dem User 2 Minuten irrefuehrendes "Verzögert" nach echtem Disconnect. Kanon setzt diese Grenze auf 120s.

### 2.2 Server-LWT-Lücke

**Kanon:** Der Server hat kein eigenes LWT. Ein Server-Crash ist erst nach ~120s erkennbar (MQTT Keep-Alive Timeout des Broker). Waehrend dieser Luecke kann das Frontend keine WS-Events empfangen, was als "Verbindung verloren" dargestellt wird. Dies ist kein ESP-Offline-Zustand.

Darstellung: Das Frontend soll bei WS-Verbindungsverlust den `WebSocket`-Status-Indikator (bereits vorhanden via `useWebSocketStatus`) sichtbar hervorheben. Kein ESP als "offline wegen Server-Crash" markieren — die ESP-Status-Ampel basiert auf `last_seen`, der Server setzt dieses Feld nicht zurueck wenn er abgeraeumt wird.

### 2.3 Offline-Transition-Kette (kanonisch)

Die Kette ist serverseitig bereits vollstaendig implementiert. Frontend erhaelt sie ausschliesslich ueber `esp_health`:

```
ESP trennt → MQTT-Broker publiziert LWT
           → lwt_handler.py: esp_devices.status = 'offline', actuator_states reset
           → lwt_handler.py: audit_logs Eintrag (event_type: lwt_received)
           → broadcast: esp_health (status='offline', source='lwt', actuator_states_reset=N)
           → Frontend: esp.ts handleEspHealth()
               → device.status = 'offline'
               → if actuator_states_reset > 0: useActuatorStore() reset
```

**Evidenz:**
- `El Frontend/src/stores/esp.ts:1199` — `if (data.status === 'offline' && data.actuator_states_reset && data.actuator_states_reset > 0)`
- `El Frontend/src/types/websocket-events.ts:100` — `actuator_states_reset?: number` im `ESPHealthEvent`
- `El Frontend/src/utils/eventTransformer.ts:143` — `lwt_received` in `esp-status`-Kategorie

Das Frontend verarbeitet die Kette korrekt. Die Visualisierung (Audit-Log-Anzeige des `lwt_received`-Eintrags) erfolgt im Events-Tab des SystemMonitors ueber `UnifiedEventList.vue` + `transformLWT()`.

### 2.4 clean_session = true als Normalbetrieb

**Kanon:** `clean_session = true` (ADR 2026-04-26, beibehalten) bedeutet, dass sich ESP32 bei Reconnect neu subscribed. Das ist Normalbetrieb. Das Frontend darf diesen Zustand nicht als Fehler anzeigen. Der Reconnect-Flow ist bereits separat ueber `esp_reconnect_phase`-Events abgedeckt (handler in `esp.ts:1287`, type in `websocket-events.ts:152`).

---

## 3. Diff-Tabelle: Implementiert vs. Fehlend

| Kategorie | Implementiert (kanonisch) | Fehlt (Follow-up) |
|---|---|---|
| Diagnose-Checks | 10 Checks via DiagnoseTab + REST (`/v1/diagnostics/run`, `/run/{name}`) | WS-getriggerte Auto-Diagnose bei kritischem Event |
| Report-History | ReportsTab mit Expand + Markdown-Export | Paginierung (aktuell `limit=20`, kein Infinite-Scroll) |
| Fleet-Health | HealthTab: Online-Count, Heap, RSSI, Problem-Devices, Sortierung | Heartbeat-Ampel-Schwellen falsch (90s/210s statt 70s/120s) |
| Audit-Log | `audit.ts` vollstaendig (Filter, Aggregation, Korrelation, Retention) | Kein dedizierter Audit-Tab in SystemMonitor — Audit-Daten nur im Events-Tab via aggregated stream |
| `esp_health` WS | Vollstaendig: `espHealth.ts`, `esp.ts:handleEspHealth`, Offline-Kette inkl. actuator_states_reset | — |
| `esp_diagnostics` WS | Server sendet (`DiagnosticsHandler:197`), aber kein Frontend-Abonnement | Kein Handler, kein Type in `websocket-events.ts`, kein Store-Update |
| `esp_heartbeat_logs` | Tabelle + Repo vorhanden, in event_aggregator_service als `esp_health`-Source verwendet | Kein REST-Endpoint `/v1/esp/{id}/heartbeat-logs` fuer gezielten Abruf; nicht direkt in UI surfacebar |
| Offline-Transition | Vollstaendig via esp_health + lwt_received + actuator_states_reset | Keine explizite "Disconnect-Kette"-Ansicht im UI (alles im Events-Tab vergraben) |
| Server-LWT-Luecke | WS-Verbindungsstatus via `useWebSocketStatus` | Kein dedizierter Banner "Server nicht erreichbar seit Xs" waehrend WS-Ausfall |
| clean_session | Kein Fehler-UI dafuer (korrekt) | — |
| Token-Konformitaet | `useESPStatus` nutzt `var(--color-success/warning/error)` | `DiagnoseTab.vue` nutzt Hex-rgba fuer Status-Banner-Border (nicht kanonisch) |

---

## 4. Token-Audit

### Diagnostics-relevante Komponenten

| Komponente | Status-Farben | Befund |
|---|---|---|
| `useESPStatus.ts` | `var(--color-success)`, `var(--color-warning)`, `var(--color-error)`, `var(--color-text-muted)` | Korrekt token-konform |
| `HealthTab.vue` | `var(--color-success)`, `var(--color-warning)`, `var(--color-error)` via `:deep()`, Grafana-Banner mit `rgba(245, 158, 11, ...)` | Teilweise Hex: `rgba(245, 158, 11, 0.08)` und `rgba(239, 68, 68, ...)` fuer Backgrounds |
| `DiagnoseTab.vue` | Status-Dot benutzt `var(--color-success)`, `var(--color-warning)`, `var(--color-error)` (korrekt). Status-Banner-Border: `rgba(52, 211, 153, 0.3)`, `rgba(251, 191, 36, 0.3)`, `rgba(248, 113, 113, 0.3)` | **Hex-Hardcode in Banner-Borders** — kein `--color-*` Token fuer rgba-Varianten verfuegbar |
| `ReportsTab.vue` | Status-Pills: `rgba(52, 211, 153, 0.15)`, `rgba(251, 191, 36, 0.15)`, `rgba(248, 113, 113, 0.15)` | **Hex-Hardcode** — gleicher Befund wie DiagnoseTab |
| `HealthSummaryBar.vue` | Nutzt `var(--color-success)`, `var(--color-warning)`, `var(--color-error)` via Token (laut Import-Kette) | Korrekt |

**Befund:** Status-Ampel-Farben (`var(--color-success/warning/error)`) sind konform. Rgba-Background-Tints fuer Status-Banner-Borders in `DiagnoseTab.vue` und `ReportsTab.vue` sind Hex-hardcoded, weil das Token-System keine `--color-success/10`-Varianten als CSS-Custom-Properties definiert (nur als Tailwind-Klassen verfuegbar). Dies ist ein bekannter Pattern-Konflikt zwischen Tailwind-First und CSS-Var-First in der Codebase.

`--color-status-good` / `--color-status-alarm` (SI-8 Auftrag) existieren in den Diagnostics-Komponenten nicht — diese Tokens werden nur in `CustomDashboardView.vue` genutzt, nicht in system-monitor/*.

---

## 5. MonitorView-Drift-Befund

**MonitorView.vue** (`El Frontend/src/views/MonitorView.vue`) enthaelt keine Forensik-Daten. Gezielte Grep-Ausfuehrung nach `esp_diagnostics`, `heartbeat` (als Event-Abonnement), `last_heartbeat` (als Forensik-Anzeige) zeigt:

- `last_seen` taucht in MonitorView nur in einer internen Berechnung auf (Zeile 1460: Actuator-Aktualitaet), nicht als Diagnostics-Anzeige.
- Keine Heartbeat-Timestamps, keine Disconnect-Events, keine Audit-Log-Referenzen.

**Befund:** Kein MonitorView-Drift. Die forensischen Daten (Heartbeat-History, Audit-Logs, Disconnect-Events) befinden sich korrekt ausschliesslich im `SystemMonitorView`-Kontext.

**Einzige Grenzzone:** `useESPStatus.ts` wird von MonitorView-Komponenten genutzt (DeviceMiniCard, ZoneDetailView), um den Online/Stale/Offline-Status anzuzeigen. Diese Nutzung ist legitim — es ist Status-Anzeige, keine Forensik. Die falsche Schwelle (90s/210s statt 70s/120s) wirkt sich jedoch in der MonitorView-Darstellung aus.

---

## 6. Server-Touchpoints-Tabelle

| Endpoint | Methode | Paginierung | Auth | Frontend-Konsument | Status |
|---|---|---|---|---|---|
| `/v1/diagnostics/run` | POST | — | `ActiveUser` | `diagnostics.ts:runFullDiagnostic()` | Implementiert |
| `/v1/diagnostics/run/{check_name}` | POST | — | `ActiveUser` | `diagnostics.ts:runSingleCheck()` | Implementiert |
| `/v1/diagnostics/history` | GET | `limit`, `offset` | `ActiveUser` | `diagnostics.ts:getDiagnosticHistory()` | Implementiert, kein Infinite-Scroll im Frontend |
| `/v1/diagnostics/history/{id}` | GET | — | `ActiveUser` | `diagnostics.ts:getDiagnosticReport()` | Implementiert |
| `/v1/diagnostics/export/{id}` | POST | — | `ActiveUser` | `diagnostics.ts:exportReportAsMarkdown()` | Implementiert |
| `/v1/diagnostics/checks` | GET | — | `ActiveUser` | `diagnostics.ts:listAvailableChecks()` | Implementiert |
| `/v1/audit` | GET | `page`, `page_size` (Offset-basiert) | `ActiveUser` | `audit.ts:list()` | Implementiert |
| `/v1/audit/events/aggregated` | GET | `before_timestamp` (Cursor) | `ActiveUser` | `audit.ts:getAggregatedEvents()` | Implementiert, Cursor-basiert |
| `/v1/audit/events/correlated/{id}` | GET | `limit` (max 200) | `ActiveUser` | `audit.ts:getCorrelatedEvents()` | Implementiert |
| `/v1/audit/esp/{id}/config-history` | GET | `limit` | `ActiveUser` | `audit.ts:getEspConfigHistory()` | Implementiert |
| `/v1/audit/statistics` | GET | — | `ActiveUser` | `audit.ts:getStatistics()` | Implementiert |
| `/v1/health/esp` | GET | — | `ActiveUser` | `health.ts:getFleetHealth()` | Implementiert (HealthTab) |
| `esp_heartbeat_logs` (direkt) | — | — | — | Kein Endpoint exponiert | **Fehlt** — nur intern via event_aggregator |
| `/v1/esp/{id}/heartbeat-logs` | — | — | — | Nicht vorhanden | **Fehlt** — Follow-up AUT-133 |
| `debug/*` (22% aller Endpoints) | — | — | `AdminUser` | `debug.ts` (Mock-ESP-Operationen) | Vorhanden, korrekt: NICHT in Diagnostics-UI surfaced |

---

## 7. Follow-up-Vorschlaege

### FU-1: Heartbeat-Ampel-Schwellen korrigieren (AUT-133, relevant)

**Scope:** `El Frontend/src/composables/useESPStatus.ts`

Aktuelle Werte:
- `HEARTBEAT_STALE_MS = 90_000` (1.5min)
- `HEARTBEAT_OFFLINE_MS = 210_000` (3.5min)

Kanon-Werte:
- `HEARTBEAT_STALE_MS = 70_000` (70s = 60s Intervall + 10s Toleranz)
- `HEARTBEAT_OFFLINE_MS = 120_000` (120s = Server-Timeout-Grenze)

Auswirkung: Jede Komponente die `getESPStatus()` oder `useESPStatus()` nutzt (ESPCard, DeviceMiniCard, HealthTab, DeviceSummaryCard, HardwareView, MonitorView). Kein weiterer Code-Aenderungsbedarf ausserhalb der Konstanten.

**Akzeptanzkriterium:** Ein ESP der seit 80s keinen Heartbeat gesendet hat, zeigt "Verzögert" (gelb). Bei >120s "Offline" (rot), auch wenn `device.status` noch nicht auf `offline` gesetzt wurde.

### FU-2: esp_diagnostics WS-Event verdrahten

**Scope:** `El Frontend/src/types/websocket-events.ts`, `El Frontend/src/utils/contractEventMapper.ts`, `El Frontend/src/stores/esp.ts`

Server sendet `esp_diagnostics` via `DiagnosticsHandler:197` mit Payload: `heap_free, heap_min_free, heap_fragmentation, uptime_seconds, error_count, wifi_rssi, mqtt_connected, system_state, boot_reason, mqtt_cb_state, wdt_*`.

Das Frontend empfaengt dieses Event aktuell nicht. Es wird nicht in `WS_EVENT_TYPES` (contractEventMapper) aufgefuehrt und hat keinen Type in `websocket-events.ts`.

**Aufwand:** Neuer Interface-Type `ESPDiagnosticsEvent`, Eintrag in `WS_EVENT_TYPES`, Handler in `esp.ts` (Speicherung in `device.device_metadata.diagnostics` oder separatem Feld), Anzeige in `DiagnoseTab` oder `DeviceDetailView`.

**Hinweis:** `DiagnoseTab.vue` zeigt aktuell Daten aus `diagnostic_reports` (manuell ausgefuehrt). Der `esp_diagnostics`-Stream liefert hingegen automatisch alle 60s Rohdaten — das ist ein anderes Konzept (Monitoring vs. Forensik-Check). Kein Zusammenfuehren erzwingen.

### FU-3: esp_heartbeat_logs REST-Endpoint fuer gezielten Abruf

**Scope:** `El Servador/god_kaiser_server/src/api/v1/esp.py` (neuer Endpoint), `El Frontend/src/api/esp.ts` (neuer API-Call)

`esp_heartbeat_logs` ist eine vollwertige Zeitreihe (7-Tage-Retention, `heap_free`, `wifi_rssi`, `uptime`, `health_status`, `runtime_telemetry`). Sie wird aktuell nur im aggregierten Event-Feed (`event_aggregator_service.py`) genutzt, ist aber nicht direkt aus dem Frontend abfragbar.

Sinnvoller Endpoint: `GET /v1/esp/{esp_id}/heartbeat-logs?hours=24&limit=100`

Verwendung: Sparkline-Darstellung in `DeviceDetailView.vue` oder `HealthTab` — Heap/RSSI-Trend pro Geraet.

**Abgrenzung:** Dies ist ein neuer Feature-Request (AUT-133 Heartbeat Metrics Utilization), kein Bug.

### FU-4: Diagnostics-Report-History Paginierung

**Scope:** `El Frontend/src/components/system-monitor/ReportsTab.vue`, `El Frontend/src/shared/stores/diagnostics.store.ts`

`getDiagnosticHistory(limit, offset)` unterstuetzt Offset-basierte Paginierung. Das Frontend laedt aktuell fest `limit=20` ohne Nachladen. Bei haeufiger Diagnostik-Nutzung wird die History abgeschnitten.

**Aufwand:** `ReportsTab.vue` um "Mehr laden"-Button oder Infinite-Scroll erweitern, `diagnostics.store.ts` um Offset-Tracking ergaenzen.

---

## Anhang: Tabellenbezeichnung

Bestaetigt aus `El Servador/god_kaiser_server/src/db/models/esp_heartbeat.py:59`:

```python
__tablename__ = "esp_heartbeat_logs"
```

Die korrekte Bezeichnung ist `esp_heartbeat_logs` (nicht `heartbeat_logs`). Diese Tabelle hat kein `TimestampMixin` (direkte `timestamp: Mapped[datetime]` Spalte). Die `diagnostic_reports`-Tabelle ist separat.
