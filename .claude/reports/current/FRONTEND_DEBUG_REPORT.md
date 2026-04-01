# Frontend Debug Report

**Erstellt:** 2026-04-01
**Modus:** B (Spezifisch: "System Monitor Probleme + Datenbankverbindung")
**Quellen:** SystemMonitorView.vue (1540 Zeilen), UnifiedEventList.vue, HealthTab.vue, DatabaseTab.vue, DiagnoseTab.vue, EventsTab.vue, database.store.ts, diagnostics.store.ts, vite.config.ts, docker compose logs el-frontend, docker compose ps, Loki

---

## 1. Zusammenfassung

Zwei eigenstaendige Problemkategorien identifiziert. Der schwerwiegendste Befund ist ein **DNS-Aufloesung-Fehler auf Infrastrukturebene**: Der el-frontend Container kann `el-servador` zeitweise nicht aufloesen (`ENOTFOUND el-servador`), was zu unterbrochenen API-Requests und fehlerhaften WebSocket-Verbindungen fuehrt. Dies erklaert Verbindungsprobleme im DatabaseTab und HealthTab. Die 4533 historischen Events sind kein Fehler, werden aber durch **mehrere Performance-Anti-Pattern** verarbeitet, die bei dieser Groesse zu sichtbarer UI-Traegheit fuehren. Ein dritter Befund betrifft einen **Watch-Trigger-Bug**, der bei Filter-Aenderungen unnoetige Doppel-Reloads ausloesen kann.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `El Frontend/src/views/SystemMonitorView.vue` | BEFUNDE | Zeilen 264-361 (filteredEvents), 913-1020 (loadHistoricalEvents), 1258-1341 (onMounted, Watch) |
| `El Frontend/src/components/system-monitor/UnifiedEventList.vue` | BEFUND | Zeile 424 (ResizeObserver DOM-Property) |
| `El Frontend/src/components/system-monitor/DatabaseTab.vue` | BEFUND | Kein clearError nach erfolgreichem Retry |
| `El Frontend/src/components/system-monitor/HealthTab.vue` | HINWEIS | loadMaintenanceData ohne dauerhaften Error-State |
| `El Frontend/src/components/system-monitor/DiagnoseTab.vue` | OK | Korrekte Store-Nutzung |
| `El Frontend/src/shared/stores/database.store.ts` | OK | Error-Handling strukturell korrekt |
| `El Frontend/src/shared/stores/diagnostics.store.ts` | OK | Vollstaendiges Error-Handling |
| `El Frontend/vite.config.ts` | BEFUND | DNS-Abhaengigkeit ohne Startup-Guard |
| `docker compose logs --tail=100 el-frontend` | KRITISCH | ENOTFOUND el-servador + ECONNREFUSED 172.19.0.9:8000 + EIO index.html |
| `docker compose ps` | OK | Alle Services healthy, el-servador laeuft auf Port 8000 |
| `curl http://localhost:8000/api/v1/health/live` | OK | `{"success":true,"alive":true}` |
| Loki | OK | Bereit und erreichbar, keine Vue-Error-Handler-Eintraege gefunden |

---

## 3. Befunde

### 3.1 DNS-Aufloesung fuer el-servador intermittierend fehlschlagend

- **Schwere:** Kritisch
- **Detail:** Docker-Logs zeigen durchgehend `getaddrinfo ENOTFOUND el-servador` fuer API-Requests und WebSocket-Verbindungen. Zwischenzeitlich wechselt der Fehler zu `ECONNREFUSED 172.19.0.9:8000` — DNS loest die IP auf, aber der Port ist nicht erreichbar. Ausserdem ein einmaliger I/O-Fehler: `EIO: i/o error, open '/app/index.html'`. El-servador selbst laeuft laut `docker compose ps` gesund auf Port 8000 und ist vom Host aus erreichbar. Das Problem liegt im Container-Netzwerk: el-frontend kann den Docker-DNS-Namen `el-servador` nicht stabil aufloesen. Ursache ist typischerweise ein Timing-Problem beim Container-Start (Vite-Proxy versucht Verbindungen bevor el-servador im Docker-DNS registriert ist) oder ein Docker-Network-Bug nach Restart (gecachte IP wird ungueltig).
- **Evidenz aus Docker-Logs:**
  ```
  12:31:22 AM [vite] http proxy error: /api/v1/auth/status
  Error: getaddrinfo ENOTFOUND el-servador
  12:34:39 AM [vite] ws proxy error:
  Error: getaddrinfo ENOTFOUND el-servador
  12:34:58 AM [vite] http proxy error: /api/v1/notifications/alerts/stats
  Error: connect ECONNREFUSED 172.19.0.9:8000
  1:23:22 AM [vite] Internal server error: EIO: i/o error, open '/app/index.html'
  ```
- **Betroffene Funktionen:** Alle API-Aufrufe im System Monitor (loadHistoricalEvents, loadHealthData, DatabaseTab.loadTables, HealthTab.fetchHealth), WebSocket-Verbindung (alle 26+ Event-Handler)

### 3.2 Watch-Trigger loest potentiell doppelten API-Reload aus

- **Schwere:** Hoch
- **Detail:** In `onMounted` (Zeile 1286) wird `loadHistoricalEvents()` explizit aufgerufen. Gleichzeitig ist ein Watch auf `[selectedDataSources, filterLevels, filterEspId]` (Zeile 1325) registriert. `filterEspId` wird via `watch(() => route.query.esp, ..., { immediate: true })` (Zeile 1317) sofort gesetzt — das loest den Filter-Watch ebenfalls aus. Bei schnellen Verbindungen oder wenn URL kein `?esp=` hat, laufen beide Initialisierungen fast gleichzeitig. Der isLoading-Guard in Zeile 1334 (`if (activeTab.value === 'events' && !isLoading.value)`) greift nur wenn der erste Aufruf noch aktiv ist — bei Servern mit kurzen Response-Zeiten oder wenn der erste Aufruf bereits beendet ist, startet der zweite Reload vollstaendig durch.
- **Evidenz:**
  - `SystemMonitorView.vue:1286` — `await loadHistoricalEvents()` in onMounted
  - `SystemMonitorView.vue:1317` — `watch(() => route.query.esp, ..., { immediate: true })` setzt `filterEspId`
  - `SystemMonitorView.vue:1325-1341` — Watch auf filterEspId loest loadHistoricalEvents() aus

### 3.3 groupedEvents Computed: Array-Reverse auf 4533 Events bei jedem WebSocket-Event

- **Schwere:** Hoch
- **Detail:** Die `groupedEvents` Computed-Property (Zeile 264) ruft `groupEventsByTimeWindow(filteredEvents.value, groupingOptions.value)` auf. `eventGrouper.ts:42` macht `const sorted = [...events].reverse()` — ein vollstaendiges Array-Copy bei jedem Aufruf. Da `filteredEvents` von `unifiedEvents` abhaengt, loest jeder einzelne WebSocket-Event (z.B. `esp_health` alle 30 Sekunden) eine vollstaendige Re-Berechnung von `filteredEvents` UND `groupedEvents` aus. Bei 4533 Events und aktiviertem Grouping: O(n) Reverse + O(n) Iteration = ~9000 Operationen pro eingehendem Event. Auch wenn `groupingEnabled = false` ist, laeuft der Computed neu — die Funktion gibt dann zwar nur `events.map()` zurueck, aber der Aufruf inkl. Scope-Erstellung passiert trotzdem.
- **Evidenz:**
  - `SystemMonitorView.vue:264-266` — groupedEvents computed, haengt an filteredEvents
  - `El Frontend/src/utils/eventGrouper.ts:42` — `const sorted = [...events].reverse()` bei jedem Computed-Aufruf

### 3.4 filteredEvents: vier sequentielle Array-Filter-Durchlaeufe

- **Schwere:** Mittel
- **Detail:** Die `filteredEvents` Computed-Property (Zeilen 288-361) fuehrt bei 4533 Events vier separate `.filter()`-Aufrufe hintereinander aus: DataSource-Filter (Zeile 295), ESP-ID-Filter (Zeile 317), Severity-Filter (Zeile 327), Time-Range-Filter (Zeile 335). Jeder Aufruf erzeugt ein neues Array. Das sind mindestens 4 * 4533 = 18132 Element-Evaluierungen pro Computed-Ausloessung. Kombiniert mit `groupedEvents` (Befund 3.3) werden bei jedem eingehenden WebSocket-Event bis zu ~25000 Operationen ausgefuehrt.
- **Evidenz:** `SystemMonitorView.vue:295, 317, 327, 335` — vier separate .filter()-Aufrufe in Sequence

### 3.5 ResizeObserver via DOM-Property gespeichert — fragiles Cleanup-Pattern

- **Schwere:** Mittel
- **Detail:** In `UnifiedEventList.vue:424` wird der ResizeObserver als dynamische Property auf dem DOM-Element gespeichert: `;(containerRef.value as any).__resizeObserver = resizeObserver`. Das ist ein `any`-Cast auf ein DOM-Element. Wenn das Element vor `onUnmounted` aus dem DOM entfernt wird (z.B. durch v-if auf dem Parent), ist `containerRef.value` null in `onUnmounted` (Zeile 448) und der Observer leakt. Ausserdem: Das Pattern mit `__resizeObserver` als DOM-Property ist fragil — ein zweiter Mount-Zyklus (Tab-Wechsel mit v-if) wuerde den alten Observer ueberschreiben ohne vorheriges disconnect.
- **Evidenz:**
  - `UnifiedEventList.vue:424` — `;(containerRef.value as any).__resizeObserver = resizeObserver`
  - `UnifiedEventList.vue:448-451` — onUnmounted: keine Null-Pruefung vor containerRef.value Zugriff

### 3.6 DatabaseTab: kein automatischer clearError nach erfolgreichem Retry

- **Schwere:** Mittel
- **Detail:** In `DatabaseTab.vue:122-127` wird der Fehler von `store.selectTable()` nur mit `log.error()` behandelt — kein `store.clearError()`. Der User sieht den Fehler-Banner (Zeile 310: `v-if="store.error"`). Beim naechsten Tabellenaufruf via `handleSelectTable()` setzt `store.selectTable()` intern `error.value = null` (database.store.ts:95) — das ist korrekt und der Banner verschwindet. Das eigentliche Problem: Wenn el-servador kurzzeitig nicht erreichbar ist (Befund 3.1), schlaegt `loadTables()` in `onMounted` fehl. Der Store setzt `error.value` und wirft weiter. `DatabaseTab.vue:241-243` catcht den Fehler nicht aus `store.loadTables()` (nur `await store.loadTables()` ohne try/catch). Folge: unbehandelte Promise-Rejection in `onMounted`.
- **Evidenz:**
  - `DatabaseTab.vue:240-243` — `onMounted` ruft `store.loadTables()` ohne try/catch auf
  - `database.store.ts:67-73` — `loadTables` setzt error und wirft weiter

### 3.7 HealthTab.loadMaintenanceData ohne dauerhaften Error-State

- **Schwere:** Niedrig
- **Detail:** `HealthTab.vue:202-216` — `loadMaintenanceData()` catcht Fehler nur mit `toast.error('Wartungsdaten konnten nicht geladen werden')`. Nach 3-5 Sekunden verschwindet der Toast. Der Benutzer sieht dann eine leere Wartungs-Sektion ohne Erklaerung, warum keine Daten vorhanden sind.
- **Evidenz:** `HealthTab.vue:210-213` — kein `maintenanceError` State, nur Toast

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `docker compose ps` | el-servador: healthy Port 8000. el-frontend: healthy Port 5173. Alle 12 Services laufen. |
| `docker compose logs --tail=100 el-frontend` | Massenhaft ENOTFOUND el-servador + ECONNREFUSED. Nach Neustart normaler Betrieb (letzte Zeile: Vite ready in 776ms). |
| `curl http://localhost:8000/api/v1/health/live` | `{"success":true,"message":null,"alive":true}` — Server vom Host erreichbar. |
| `docker inspect automationone-frontend (env)` | `VITE_API_TARGET=http://el-servador:8000` korrekt gesetzt. `VITE_WS_TARGET=ws://el-servador:8000` korrekt. |
| Loki-Check | `ready` — Loki verfuegbar und aktiv. |
| Loki Vue Error Query | Keine `[Vue Error]` Eintraege gefunden — keine Vue-Runtime-Fehler im Log. |
| Source-Code: Watch-Pattern | Doppel-Reload-Risiko identifiziert (Befund 3.2). |
| Source-Code: filteredEvents | 4 separate .filter()-Laeufe auf 4533 Events (Befund 3.4). |
| Source-Code: groupedEvents | Array-Reverse bei jedem Computed (Befund 3.3). |
| Source-Code: ResizeObserver | Fragiles DOM-Property-Pattern (Befund 3.5). |
| Source-Code: DatabaseTab onMounted | loadTables() ohne try/catch (Befund 3.6). |

---

## 5. Blind-Spot-Fragen (an User)

Diese Fragen koennen nur im Browser beantwortet werden:

**Zur DNS-Aufloesung (Befund 3.1):**
- Treten die Verbindungsfehler direkt nach dem Browser-Tab-Oeffnen auf, oder erst nach einiger Zeit?
- Hilft `docker compose restart el-frontend` dauerhaft oder kehren die ENOTFOUND-Fehler nach einigen Minuten zurueck?

**Zum System Monitor:**
- Ist im Network-Tab des Browsers ein fehlgeschlagener Request auf `/api/v1/audit/events/aggregated` oder `/ws/` sichtbar, wenn der System Monitor geladen wird?
- Bleibt der DatabaseTab auf "Tabelle auswaehlen..." haengen, oder erscheinen Tabellen in der Dropdown-Liste?
- Wie lange dauert das initiale Laden (vom Oeffnen der Seite bis zur Meldung "Loaded 4533 historical events")?

**Zur Performance:**
- Ist die Toggle-Funktion "Gruppierung" (Grouping) im Events-Tab aktiviert? Falls ja: Fuehlt sich das UI nach dem Laden merklich traege an wenn neue Events ankommen?

---

## 6. Bewertung & Empfehlung

### Root Causes

**Problem 1: Datenbankverbindung / API-Fehler im System Monitor**
Root Cause: DNS-Race-Condition beim Container-Start. Vite's Dev-Server-Proxy versucht Verbindungen zu `el-servador`, bevor der Container im Docker-internen DNS registriert ist. Nach einer Weile (wenn el-servador laeuft) klappt es — aber bei Restarts oder Netzwerkfluktuationen bricht die gecachte IP (`172.19.0.9`) ab. Sofort-Workaround: `docker compose restart el-frontend`. Saubere Loesung: `depends_on` mit health-check in docker-compose.yml.

**Problem 2: System Monitor Performance bei 4533 Events**
Root Cause: Kein Single-Pass-Filter. filteredEvents (4 separate .filter()) und groupedEvents (Array-Reverse) werden bei jedem eingehenden WebSocket-Event vollstaendig neu berechnet. Bei 4533 Events und 30-Sekunden-Heartbeats sind das ~2 vollstaendige Berechnungen pro Minute, jede mit ~25000 Array-Operationen. Bei sehr aktiven ESP-Setups (viele Events pro Sekunde) ist das ein spuerbares Problem.

### Priorisierte Naechste Schritte

1. **Sofort (ohne Code-Aenderung):** `docker compose restart el-frontend` — DNS-Cache wird geleert, Verbindung stabilisiert sich.

2. **HIGH: Befund 3.1 (DNS-Race) — docker-compose.yml aendern:**
   `el-frontend` Service um `depends_on: el-servador: condition: service_healthy` ergaenzen. Damit startet Vite erst nach erfolgreichem Health-Check von el-servador.

3. **HIGH: Befund 3.2 (Doppel-Reload) — SystemMonitorView.vue:1286:**
   Den expliziten `await loadHistoricalEvents()` Aufruf in `onMounted` entfernen. Den `immediate: true` Watch auf `route.query.esp` als alleinigen Init-Trigger nutzen — oder umgekehrt: URL-Watch ohne `immediate` und `onMounted` als einziger Trigger. Beide Wege beheben das Race.

4. **MEDIUM: Befund 3.3+3.4 (Performance) — SystemMonitorView.vue + eventGrouper.ts:**
   `filteredEvents` auf einen Single-Pass (for-Loop statt 4x .filter()) optimieren. `groupedEvents` nur berechnen wenn `groupingEnabled === true` (lazy guard am Anfang der Computed).

5. **MEDIUM: Befund 3.5 (ResizeObserver) — UnifiedEventList.vue:424:**
   Observer in lokaler `ref<ResizeObserver | null>(null)` speichern statt als DOM-Property.

6. **MEDIUM: Befund 3.6 (DatabaseTab onMounted) — DatabaseTab.vue:240-243:**
   `store.loadTables()` in try/catch wrappen: `try { await store.loadTables() } catch { /* store.error ist bereits gesetzt */ }`.

### Lastintensive Ops (Vorschlag)

Soll ich einen Type-Check ausfuehren? (`docker compose exec el-frontend npx vue-tsc --noEmit`, dauert ca. 1-3 Minuten) — um zu pruefen ob die `any`-Casts in UnifiedEventList.vue TypeScript-Fehler verursachen und ob weitere Type-Probleme im SystemMonitor-Bereich vorhanden sind.

---

## 7. Datei-Referenzen (betroffene Stellen)

| Datei | Zeile | Befund-Nr | Beschreibung |
|-------|-------|-----------|--------------|
| `El Frontend/src/views/SystemMonitorView.vue` | 264-266 | 3.3 | groupedEvents Computed — Array-Reverse bei jedem Aufruf |
| `El Frontend/src/views/SystemMonitorView.vue` | 288-361 | 3.4 | filteredEvents — 4 separate .filter()-Durchlaeufe |
| `El Frontend/src/views/SystemMonitorView.vue` | 1286 | 3.2 | Expliziter loadHistoricalEvents() im onMounted |
| `El Frontend/src/views/SystemMonitorView.vue` | 1317 | 3.2 | URL-Watch mit `immediate: true` setzt filterEspId |
| `El Frontend/src/views/SystemMonitorView.vue` | 1325-1341 | 3.2 | Watch auf filterEspId loest loadHistoricalEvents() aus |
| `El Frontend/src/utils/eventGrouper.ts` | 42 | 3.3 | `[...events].reverse()` bei jedem Computed-Aufruf |
| `El Frontend/src/components/system-monitor/UnifiedEventList.vue` | 424 | 3.5 | `(containerRef.value as any).__resizeObserver` — unsicheres DOM-Property-Pattern |
| `El Frontend/src/components/system-monitor/UnifiedEventList.vue` | 448-451 | 3.5 | onUnmounted: potentiell null containerRef.value |
| `El Frontend/src/components/system-monitor/DatabaseTab.vue` | 240-243 | 3.6 | loadTables() in onMounted ohne try/catch |
| `El Frontend/src/components/system-monitor/HealthTab.vue` | 210-213 | 3.7 | loadMaintenanceData: nur Toast-Error, kein dauerhafter Error-State |
| `El Frontend/vite.config.ts` | 17 | 3.1 | `VITE_API_TARGET=http://el-servador:8000` — DNS-Abhaengigkeit ohne Startup-Guard |
