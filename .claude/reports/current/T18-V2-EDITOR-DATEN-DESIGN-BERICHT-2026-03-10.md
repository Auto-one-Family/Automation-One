# T18-V2 Verifikationsbericht: Fix-Verifikation + Datenvisualisierung, Persistenz, Design & Datenanalyse-Integration

**Datum:** 2026-03-10
**Typ:** Fix-Verifikation + Tiefenanalyse (Live-Browser-Test via Playwright + Code-Review)
**Hardware:** ESP_472204 "Zelt Agent", SHT31 (GPIO 0, I2C 0x44), Olimex PWR Switch Relay (GPIO 27)
**Zone:** "Zelt Wohnzimmer", Subzone "Pflanze 1"
**Screenshots:** `.claude/reports/current/T18-V2-screenshots/`
**Vorbedingung:** T18-V1 abgeschlossen, Fixes 6.3/6.6/7.0/7.1/7.2 implementiert

---

## Block 0: Fix-Verifikation — Zusammenfassung

| Test-ID | Finding/Fix | Status | Notizen |
|---------|-------------|--------|---------|
| T18-V2-00a | F-01 Widget-Loeschen (7.1-A) | **PASS** | X-Button sichtbar, Confirm-Dialog, autoSave PUT, im View-Mode versteckt, roter Hover |
| T18-V2-00b | F-02 Deep-Link Selector (7.1-B) | **PASS** | Korrekter Name im Selector, Wechsel funktioniert, ungueltige ID → Toast + Fallback |
| T18-V2-00c | F-03 Server-Persistenz (7.0) | **PASS** | 26/26 mit serverId, 0 local-only, Template + Auto-Gen → Server-Sync OK |
| T18-V2-00d | F-04+F-06 Empty-State (7.1-C) | **PASS** | Edit-Mode bei Create, Empty-State mit "Noch keine Widgets" + Bearbeiten-Button |
| T18-V2-00e | F-05 Zone-Dashboards Monitor (7.2) | **PASS** | InlineDashboardPanel sichtbar, "Im Editor bearbeiten" Link, CSS-Grid Rendering |
| T18-V2-00f | F-07 Debounce-Analyse | **PARTIAL** | 3 PUTs fuer 3 schnelle Adds — Debounce triggert pro Add statt zu batchen |
| T18-V2-00g | F-08 Auto-Badge (7.1-D.1) | **PASS** | "Auto"-Badge bei auto-generierten, fehlt bei manuellen und Templates |
| T18-V2-00h | F-09 Zeitraum-Chips (7.1-D.2) | **PASS** | Aktiver Zeitraum blau hervorgehoben, Wechsel funktioniert |
| T18-V2-00i | 6.3 Monitor Read-Only | **PASS** | Kein Toggle-Button im Monitor, "Kein Aktor konfiguriert" bei unkonfiguriertem Widget |
| T18-V2-00j | 6.6 claimAutoLayout Sync | **PASS** | PUT-Request mit auto_generated: false nach Claim, nicht ueberschrieben nach Reload |
| T18-V2-00k | 6.6 generateZoneDashboard Sync | **PASS** | Auto-Dashboard wird bei Sensor-Aenderung aktualisiert, Server-Sync nach ~2s |
| T18-V2-00l | 7.0-C Orphan Catch-Up | **PASS** | 7 POST-Requests beim App-Start fuer Orphan-Dashboards |
| T18-V2-00m | 7.1-C.1 Template → Edit-Mode | **FAIL** | Oeffnet im View-Mode, Template-Widgets fehlen (leeres Dashboard) |
| T18-V2-00n | 7.2-B Migration Zone-Dashboards | **PASS** | Alle auto-generierten haben target: { view: 'monitor', placement: 'inline' } |
| T18-V2-00o | Gesamtbild Usability | **PASS** | Tab-Wechsel preserviert Daten, alle Widgets rendern korrekt nach Reload |
| T18-V2-00p | Regressions-Check | **PASS** | Export JSON, Target-Konfigurator (4 Optionen + Konflikt-Erkennung), DnD, alle 9 Widget-Typen |

### Fix-Verifikation Ergebnis: **14 PASS, 1 PARTIAL, 1 FAIL**

---

## Block 0: Detaillierte Ergebnisse

### T18-V2-00a — F-01 FIX: Widget-Loeschen per X-Button (7.1-A) — PASS

**Evidenz:**
- X-Button im Widget-Header sichtbar (rechts neben Zahnrad-Icon) im Edit-Mode
- Klick auf X → Confirm-Dialog via uiStore.confirm ("Widget entfernen?")
- Nach Bestaetigung: Widget wird aus Grid entfernt
- Network-Tab: PUT-Request nach ~2s (autoSave Debounce)
- Im View-Mode: X-Button NICHT sichtbar (v-if="isEditing")
- Roter Hover-State vorhanden (--color-status-alarm)
- Drag-to-Remove funktioniert weiterhin (keine Regression)
- **Screenshot:** `T18-V2-00a-delete-button.png`

### T18-V2-00b — F-02 FIX: Deep-Link Selector-Sync (7.1-B) — PASS

**Evidenz:**
- Navigation zu `/editor/{serverId}` → Selector zeigt korrekten Dashboard-Namen
- Selector-Wechsel zu anderem Dashboard funktioniert
- Edit/View-Toggle funktioniert nach Deep-Link
- Navigation zu `/editor/{ungueltigeId}` → Toast-Warnung + Fallback auf erstes Dashboard
- **Screenshot:** `T18-V2-00b-deeplink.png`

### T18-V2-00c — F-03 FIX: Server-Persistenz (7.0) — PASS

**Evidenz:**
- Console-Log: "Fetched 26 dashboards from server, 0 local-only"
- localStorage: 26 Layouts, alle mit serverId !== null
- Server-API GET /api/v1/dashboards: 26 Dashboards
- localStorage-Count === Server-Count
- Template-Test: Neues Dashboard aus Template → serverId nach ~5s vorhanden
- Auto-Gen-Test: Zone-Dashboard → serverId nach ~5s vorhanden
- **Screenshot:** `T18-V2-00c-server-sync.png`

### T18-V2-00d — F-04+F-06 FIX: Empty-State (7.1-C) — PASS

**Evidenz:**
- Neues Dashboard oeffnet direkt im Edit-Mode (isEditing=true)
- Widget-Katalog sichtbar
- View-Mode bei leerem Dashboard: Zentriertes Icon + "Noch keine Widgets" + "Bearbeiten"-Button
- Klick auf "Bearbeiten" → wechselt zurueck in Edit-Mode
- Dashboard MIT Widgets zeigt KEINEN Empty-State
- **Screenshot:** `T18-V2-00d-empty-state.png`

### T18-V2-00e — F-05 FIX: Zone-Dashboards Monitor (7.2) — PASS

**Evidenz:**
- Monitor L2 fuer "Zelt Wohnzimmer": InlineDashboardPanel sichtbar
- Position: Unter den Subzone-Gruppen
- Panel zeigt Dashboard-Namen + "Im Editor bearbeiten" Link (Pencil-Icon)
- Widgets im Panel korrekt gerendert (CSS-Grid, nicht GridStack)
- Read-Only: ActuatorCardWidget ohne Toggle-Button
- Target korrekt: `{ view: 'monitor', placement: 'inline' }`
- **Screenshot:** `T18-V2-00e-monitor-inline.png`

### T18-V2-00f — F-07 ANALYSE: Debounce-Verhalten — PARTIAL

**Evidenz:**
- 3 Widgets in schneller Folge hinzugefuegt (~1s Abstand)
- Ergebnis: 3 separate PUT-Requests
- Debounce (2s) triggert nach jedem Add, aber batcht nicht mehrere Aenderungen
- Bei ~3-5s Abstand: Jeder Klick erzeugt erwartungsgemaess einen eigenen PUT
- **Bewertung:** Funktional korrekt, aber nicht optimal. Bei schnellen Aenderungen entstehen unnoetige Server-Calls. Kein Datenverlust, aber Performance-Overhead.
- **Empfehlung:** Debounce-Timer bei erneutem Add zuruecksetzen (resetOnTrigger-Pattern)

### T18-V2-00g — F-08 FIX: Auto-Badge (7.1-D.1) — PASS

**Evidenz:**
- Dashboard-Selector geoeffnet
- Auto-generierte Dashboards: "Auto"-Badge sichtbar (kleiner grauer Text)
- Manuell erstellte Dashboards: Kein Badge
- Template-Dashboards: Kein Badge
- Badge-Styling: Unauffaellig, gedaempfte Farbe, nicht dominant
- **Screenshot:** `T18-V2-00g-auto-badge.png`

### T18-V2-00h — F-09 FIX: Zeitraum-Chips (7.1-D.2) — PASS

**Evidenz:**
- WidgetConfigPanel fuer historical-Widget geoeffnet
- Zeitraum-Chips sichtbar: 1h, 6h, 24h, 7d
- Aktiver Zeitraum (24h default) mit blauer Hervorhebung
- Klick auf anderen Zeitraum: Hervorhebung wechselt korrekt
- Styling konsistent mit ViewTabBar
- **Screenshot:** `T18-V2-00h-zeitraum-chips.png`

### T18-V2-00i — 6.3 FIX: Monitor Read-Only — PASS

**Evidenz:**
- ActuatorCardWidget im Monitor-Panel: Status sichtbar (ON/OFF Badge, Typ)
- Toggle-Button NICHT vorhanden (v-if="!readOnly")
- Unkonfiguriertes Widget: "Kein Aktor konfiguriert" Platzhalter
- Im Editor (CustomDashboardView): Toggle-Button vorhanden und funktional
- **Screenshot:** `T18-V2-00i-readonly.png`

### T18-V2-00j — 6.6 FIX: claimAutoLayout Sync — PASS

**Evidenz:**
- Auto-generiertes Zone-Dashboard gefunden
- "Uebernehmen" geklickt → Network-Tab: PUT-Request mit auto_generated: false
- Browser-Tab geschlossen, neuer Tab → Dashboard weiterhin autoGenerated: false
- Bei naechstem Zone-Besuch: Dashboard wird NICHT ueberschrieben

### T18-V2-00k — 6.6 FIX: generateZoneDashboard Update-Sync — PASS

**Evidenz:**
- Auto-Dashboard wird bei Zone-Aenderung lokal aktualisiert
- Network-Tab: PUT-Request nach ~2s mit aktualisierter Widget-Liste
- Nach Browser-Reload: Widget-Liste ist korrekt (nicht alte Version)

### T18-V2-00l — 7.0-C FIX: Orphan Catch-Up — PASS

**Evidenz:**
- App-Start beobachtet via Network-Tab
- 7 POST-Requests fuer Dashboards ohne serverId
- Console: "[DashboardStore] Syncing 7 orphan dashboards to server"
- Nach Catch-Up: Alle Dashboards haben serverId
- Kein Duplikat auf dem Server (keine doppelten Dashboard-Namen)

### T18-V2-00m — 7.1-C.1 FIX: Template-Dashboard → Edit-Mode — **FAIL**

**Evidenz:**
- Dashboard aus Template "Sensor-Detail" erstellt
- **FAIL 1:** Dashboard oeffnet im View-Mode statt Edit-Mode
- **FAIL 2:** Template-Widgets (LiveChart + SensorCard + Historical) fehlen — leeres Dashboard
- Server-Sync: serverId wird nach ~5s vergeben (PASS)
- **Ursache (vermutet):** Template-Widgets werden nicht korrekt in das Layout uebernommen, oder das Template-Format stimmt nicht mit dem erwarteten Widget-Schema ueberein
- **Neues Finding F-V2-01:** Template-Dashboard-Erstellung defekt — Widgets gehen verloren

### T18-V2-00n — 7.2-B FIX: Migration Zone-Dashboards — PASS

**Evidenz:**
- localStorage inspiziert: Alle auto-generierten Zone-Dashboards haben target inline
- Manuell erstellte (autoGenerated=false): NICHT migriert
- Cross-Zone Dashboards: NICHT migriert

### T18-V2-00o — Gesamtbild Usability — PASS

**Evidenz:**
- Kompletter Workflow durchgespielt: Neues Dashboard → Widgets hinzufuegen → Konfigurieren → Widget loeschen → Target setzen → Monitor pruefen → Reload
- Gesamter Flow funktioniert ohne Fehler
- Alle Daten nach Reload erhalten
- Monitor zeigt Dashboard korrekt
- **UX-Eindruck:** Fixes deutlich spuerbar. Editor fuehlt sich solider an als vor T18-V1. Besonders X-Button, Auto-Badge und Empty-State verbessern die Discoverability.
- **Neue Findings:** Template-Bug (s. T18-V2-00m), Debounce nicht optimal (s. T18-V2-00f)

### T18-V2-00p — Regressions-Check — PASS

**Evidenz:**
- Widget-Katalog: Alle 9 Typen sichtbar und hinzufuegbar
- GridStack DnD: Verschieben und Skalieren funktioniert
- WidgetConfigPanel: Sensor-Auswahl, Farben, Schwellwerte funktionieren
- Target-Konfigurator: Alle 4 Optionen + Konflikt-Erkennung funktionieren
- Dashboard-Export (JSON Download) funktioniert
- Dashboard-Loeschen (Trash-Button + Confirm) funktioniert

---

## Block A: Datenvisualisierung — Qualitaetspruefung

### T18-V2-01 — LineChartWidget: Live-Datenfluss

**Ergebnis:** Funktional, aber mit Einschraenkungen
- Neue Datenpunkte werden in Echtzeit hinzugefuegt via WebSocket
- 60-Punkte-Buffer korrekt (letzte ~60 Werte im Ring-Buffer)
- Y-Achse korrekt skaliert fuer Temperatur (Grad C, vernuenftige Range ~18-22)
- Einheiten werden im Tooltip angezeigt
- X-Achse: HH:MM:SS Format, lesbar
- **Qualitaets-Urteil:** Solide Basisimplementierung, Chart.js-Standard. Fehlt: Trend-Linie, Min/Max-Bereich, Zoom
- **Screenshot:** `T18-V2-01-line-chart-live.png`

### T18-V2-02 — GaugeWidget: Aktueller Wert

**Ergebnis:** Gut implementiert
- Gauges zeigen aktuelle Werte korrekt (Temperatur ~19.5 Grad C, Feuchte ~40.5 %RH)
- Werte werden bei neuen Daten live aktualisiert
- Skala: Temperatur 0-50, Feuchte 0-100 (sinnvolle Defaults)
- Farbbereiche: gruen/gelb/rot basierend auf Threshold-Config
- Einheiten und Sensorname sichtbar
- **Screenshot:** `T18-V2-02-gauge-widgets.png`

### T18-V2-03 — HistoricalChartWidget: Zeitreihen-Qualitaet

**Ergebnis:** KRITISCHER BUG bei Humidity-Daten
- Historische Daten werden aus API geladen (GET /sensors/data)
- 24h-Abfrage liefert ~580 Datenpunkte (limit=1000)
- **KRITISCH: Y-Achse zeigt RAW-Werte (0-30000 fuer %RH) statt processed values (0-100%)**
- Code-Evidenz: `HistoricalChart.vue:122` verwendet `d.raw_value` statt `d.processed_value`
- Temperatur-RAW-Werte (~24000 = ~19.5 Grad C) werden ebenfalls als Rohwerte dargestellt
- Luecken werden als durchgezogene Linie dargestellt (kein Gap-Handling)
- **Neues Finding F-V2-02 (CRITICAL):** HistoricalChart zeigt raw_value statt processed_value
- **Screenshot:** `T18-V2-03-historical-24h.png`

### T18-V2-04 — MultiSensorWidget: Vergleichs-Darstellung

**Ergebnis:** Gut implementiert mit Dual-Y-Achse
- Beide Sensoren als separate Linien mit verschiedenen Farben
- Legende mit Sensornamen + Farben vorhanden
- **Dual-Y-Achsen:** Temperatur links, Feuchte rechts (korrekte Skalierung)
- Tooltips zeigen beide Werte beim Hover
- Datenpunkt-Zaehler und Live-Indikator sichtbar
- **Screenshot:** `T18-V2-04-multi-sensor.png`

### T18-V2-05 — SensorCardWidget vs. GaugeWidget: Redundanz

**Ergebnis:** Beide haben Daseinsberechtigung
- Beide zeigen denselben aktuellen Wert
- **SensorCard zeigt zusaetzlich:** Quality-Dot (gut/schlecht), ESP-Name, Sensor-Typ, GPIO, letzter Zeitstempel
- **Gauge zeigt zusaetzlich:** Visuellen Bereich (Skala), Farbbereiche (Alarm/Warnung), sofortiges visuelles Feedback
- **Redundanz-Urteil:** Sinnvolle Koexistenz. SensorCard = Detail-Karte (Diagnose), Gauge = Schnell-Ueberblick (Monitoring). Beide behalten.
- **Screenshot:** `T18-V2-05-sensorcard-vs-gauge.png`

### T18-V2-06 — ActuatorCardWidget: Toggle-Funktion

**Ergebnis:** Funktional
- Aktueller Zustand korrekt angezeigt (ON/OFF Badge)
- Toggle-Button funktioniert (ON → OFF, OFF → ON)
- Zustand wird nach Toggle sofort aktualisiert
- MQTT-Command wird gesendet, actuator_states aendern sich
- Karte zeigt ESP-Name, GPIO, Aktor-Typ
- Typ-Anzeige: "digital" (nicht "relay") — bekanntes Issue F-V4-02 bestaetigt
- **Screenshot:** `T18-V2-06-actuator-toggle.png`

### T18-V2-07 — ESPHealthWidget: Geraete-Status

**Ergebnis:** Informativ
- ESP_472204 wird angezeigt mit Status (online/offline)
- Informationen: Status-Badge, RSSI-Signal, Uptime, Free Heap
- Zone-Filter funktioniert (zeigt nur ESPs der Zone)
- Offline-ESPs werden visuell hervorgehoben (rotes Badge)
- **Screenshot:** `T18-V2-07-esp-health.png`

### T18-V2-08 — AlarmListWidget: Benachrichtigungs-Integration

**Ergebnis:** Basis-Implementierung
- Widget zeigt aktive Alarme/Benachrichtigungen aus alertCenterStore
- Leerer Zustand: "Keine aktiven Alarme" Meldung
- Zone-Filter funktioniert
- Alarm-Zeitstempel und Prioritaet sichtbar
- **Einschraenkung:** Keine Alarm-Acknowledge-Funktion im Widget
- **Screenshot:** `T18-V2-08-alarm-list.png`

---

## Block B: Persistenz und Sync-Konsistenz

### T18-V2-09 — Dual-Storage-Konsistenz

**Ergebnis:** Grundsaetzlich konsistent, mit Timing-Gap
- localStorage und Server-API zeigen identische Dashboard-Struktur
- **Uebereinstimmend:** Dashboard-Name, Widget-Anzahl, Widget-Typen, Target-Setting, scope, zoneId
- **Widget-Positionen (x, y, w, h):** Stimmen ueberein
- **Widget-Configs:** Stimmen ueberein
- **Timing-Gap:** Zwischen Widget-Aenderung und Server-Sync liegen ~2s (Debounce). In diesem Fenster kann localStorage aktueller sein als Server.
- **Bewertung:** Akzeptabel fuer Single-User-System. Bei Multi-User waere ein Conflict-Resolution-Mechanismus noetig.

### T18-V2-10 — Server-Sync nach Widget-Aenderung

**Ergebnis:** Funktional
- PUT-Request wird nach ~2s Debounce gesendet
- PUT-Body enthaelt aktualisierte Config
- Response-Status: 200 OK
- Kein 401-Error beobachtet (F-V4-05 nicht reproduziert)

### T18-V2-11 — Offline-Resilience

**Ergebnis:** Teilweise implementiert
- Aenderungen werden lokal in localStorage gespeichert
- PUT-Requests schlagen im Offline-Modus fehl (Network Error)
- **Kein Retry-Mechanismus:** Nach Reconnect werden die Aenderungen NICHT automatisch nachgesynct
- lastSyncError wird im Store gesetzt, aber kein sichtbares Error-UI fuer den User
- **Gap:** Bei Netzwerk-Unterbrechung waehrend der Bearbeitung koennen Aenderungen auf dem Server fehlen. Erst beim naechsten User-Edit (nach Reconnect) wird der volle State gesynct.
- **Empfehlung:** Retry-Queue fuer fehlgeschlagene Sync-Requests implementieren

### T18-V2-12 — Auto-Dashboard Claim-Flow (Vertiefung)

**Ergebnis:** Korrekt implementiert
- claimAutoLayout() setzt autoGenerated: true → false
- PUT-Request mit auto_generated: false wird gesendet
- Dashboard danach frei editierbar
- Bei naechster Zone-Regenerierung: NICHT ueberschrieben
- **Neues Auto-Dashboard:** Es wird KEIN neues Auto-Dashboard zusaetzlich erstellt. Die Zone hat dann nur das claimed Dashboard. Erst wenn das claimed Dashboard geloescht wird, wird ein neues Auto-Dashboard bei Zone-Besuch generiert.

### T18-V2-13 — generateZoneDashboard: Widget-Mapping

**Ergebnis:** Sinnvolles Mapping
- Sensor-Typ → Widget-Typ Mapping:
  - `sht31_temp` → `line-chart` (Live-Temperatur-Verlauf)
  - `sht31_humidity` → `gauge` (Aktuelle Feuchte)
  - `relay/actuator` → `actuator-card` (Toggle-Steuerung)
- sensorId-Format: `{espId}:{gpio}:{sensorType}`
- Widgets werden nicht ueberlappend positioniert (GridStack Auto-Placement)
- **Einschraenkung:** Kein esp-health Widget wird automatisch hinzugefuegt (waere sinnvoll)

### T18-V2-14 — Dashboard-Templates

**Ergebnis:** 4 Templates vorhanden, aber Template-Bug (s. T18-V2-00m)
- Verfuegbare Templates:
  1. "Zonen-Uebersicht" (4x Gauge fuer verschiedene Sensor-Typen)
  2. "Sensor-Detail" (LiveChart + SensorCard + Historical)
  3. "Multi-Sensor-Vergleich" (1x MultiSensor-Widget)
  4. "Leer starten" (kein Widget)
- **BUG:** Template-Widgets werden nicht korrekt ins Layout uebernommen (s. F-V2-01)
- Default-Konfiguration waere sinnvoll WENN die Widgets ankommen wuerden

---

## Block C: Redundanz- und Design-Audit

### T18-V2-15 — Doppelte Einstellungen: Editor vs. SensorConfigPanel

**Ergebnis:** REDUNDANZ VORHANDEN

**Schwellwerte an ZWEI Stellen konfigurierbar:**

| Einstellung | WidgetConfigPanel (Editor) | SensorConfigPanel (Hardware) |
|------------|---------------------------|------------------------------|
| Alarm Low | `alarmLow` | `threshold_min` |
| Warn Low | `warnLow` | `warning_min` |
| Warn High | `warnHigh` | `warning_max` |
| Alarm High | `alarmHigh` | `threshold_max` |

- **Problem:** Beide Stellen konfigurieren Schwellwerte fuer denselben Sensor, aber die Werte sind NICHT synchronisiert. WidgetConfigPanel hat eigene Felder, SensorConfigPanel schreibt in die DB.
- WidgetConfigPanel auto-populiert aus SENSOR_TYPE_CONFIG (Default-Werte), nicht aus der DB-Config.
- **Empfehlung:** Schwellwerte NUR in SensorConfigPanel (HardwareView). WidgetConfigPanel sollte die DB-Werte lesen und anzeigen, aber nicht eigenstaendig konfigurierbar machen. "Eine Stelle pro Einstellung."

### T18-V2-16 — Doppelte Anzeigen: Widget vs. Monitor-Card

**Ergebnis:** Sinnvolle Koexistenz, aber Design-Inkonsistenz

- SensorCardWidget (Editor) vs. SensorCard (Monitor L2):
  - Beide zeigen: Aktueller Wert, Einheit, Qualitaet, Sensorname
  - Monitor-Card zeigt zusaetzlich: GPIO, Subzone-Kontext, letzte Aktualisierung
  - Widget zeigt zusaetzlich: Konfigurierbarer Titel, Farbanpassung
  - **Design:** Unterschiedliches Styling (Widget hat Widget-Wrapper, Monitor-Card hat eigenes Design)
- ActuatorCardWidget vs. ActuatorCard:
  - Widget: Toggle-Button (im Editor), kein Toggle (im Monitor — Read-Only Fix 6.3)
  - Monitor-Card: Immer mit Toggle-Button
  - **Sinnvoll:** Unterschiedliches Verhalten je nach Kontext
- **Redundanz-Urteil:** Koexistenz gerechtfertigt (Dashboard = konfigurierbar, Monitor = Kontext-gebunden). Design sollte vereinheitlicht werden.

### T18-V2-17 — Design-Token-Konsistenz

**Ergebnis:** Gut, mit minimalen Ausnahmen

- **236 CSS-Variable-Referenzen** in 14 Widget-Dateien (var(--color-*), var(--space-*), var(--radius-*))
- **1 hardcodierte Farbe gefunden:** `#8b5cf6` in DeviceStatusWidget.vue (fuer "Andere"-Kategorie in Chart)
- Alle Widget-Container verwenden konsistente Tokens:
  - Border-radius: `var(--radius-lg)` durchgehend
  - Shadow: `var(--shadow-card)` oder `var(--shadow-sm)`
  - Padding: `var(--space-4)` als Standard
- **Bewertung: 4/5** — Fast perfekte Token-Nutzung. Nur 1 hardcodierte Farbe.

### T18-V2-18 — Responsive Verhalten

**Ergebnis:** Grundlegend funktional, Einschraenkungen bei Tablet

- **Desktop (1920px):** Volle Breite, 12-Spalten-Grid, Widget-Katalog + Config-Panel + Grid nebeneinander
- **Laptop (1366px):** Grid wird schmaler, Widgets skalieren mit. Katalog ueberlappt leicht bei geoeffnetem Config-Panel.
- **Tablet (1024px):** Grid sehr kompakt, Katalog klappt zu einem Overlay um. Config-Panel ueberlappt den Grid-Bereich teilweise. Toolbar alle Buttons sichtbar.
- **Screenshots:** `T18-V2-18a-1920.png`, `T18-V2-18b-1366.png`, `T18-V2-18c-1024.png`
- **Bewertung: 3/5** — Desktop gut, Laptop akzeptabel, Tablet knapp. Kein Mobile-Support (erwartbar fuer Dashboard-Editor).

### T18-V2-19 — Chart-Bibliothek und -Qualitaet

**Ergebnis:** Chart.js — solide aber mit Luecken

- **Bibliothek:** Chart.js (via `chart.js` npm-Paket, 8 Chart-Komponenten)
- **Komponenten:**
  - `LiveLineChart.vue` — Echtzeit-Liniendiagramm mit Ring-Buffer
  - `GaugeChart.vue` — Radiales Gauge mit Farbbereichen
  - `HistoricalChart.vue` — Zeitreihen mit API-Daten
  - `MultiSensorChart.vue` — Multi-Achsen-Vergleich mit Dual-Y
  - `StatusBarChart.vue` — Balkendiagramm fuer Status-Uebersicht
- **Smooth:** Ja, keine Ruckler bei neuen Datenpunkten
- **Tooltips:** Vorhanden (Chart.js Standard)
- **Zoom/Pan:** NICHT implementiert
- **Achsen:** Korrekt beschriftet (Einheiten, Zeitstempel)
- **Leere Datenbereiche:** Durchgezogene Linie (kein Gap-Handling)
- **Bewertung: 3/5** — Solide Basis. Fehlt: Zoom/Pan, Gap-Handling, Annotations

### T18-V2-20 — Gesamt-Eindruck professionelles Dashboard

**Ergebnis:** Gute Basis, fehlt Tiefe fuer Produktionsreife

**"Ideales" Dashboard gebaut:**
- 2x Gauge oben (Temperatur + Feuchte)
- 1x LineChart Mitte (Temperatur Live)
- 1x ActuatorCard unten links (Relay)
- 1x ESPHealth unten rechts

**Bewertung:**
- Dashboard sieht sauber und funktional aus
- Richtige Informationen prominent angezeigt
- **Fehlende Informationen:**
  - Keine Trend-Pfeile (Pfeil hoch/runter/neutral) fuer Wertaenderung
  - Kein Min/Max/Avg der letzten Stunde
  - Keine VPD-Berechnung (fuer Pflanzenzucht essentiell)
  - Keine Warnungs-Banner wenn Werte ausserhalb des Optimalbereichs
- **Screenshot:** `T18-V2-20-ideales-dashboard.png`

---

## Block D: Datenanalyse-Integration — Gap-Analyse

### T18-V2-21 — Fehlende Aggregation: Resolution-Parameter

**Ergebnis:** Bestaetigt — kein Resolution-Parameter

**Code-Evidenz:**
- `GET /api/v1/sensors/data` (sensors.py): Parameter sind `esp_id`, `gpio`, `sensor_type`, `start_time`, `end_time`, `limit`, `quality`
- **KEIN** `resolution`, `downsample`, `aggregate`, `interval` Parameter
- Bei 7d-Zeitraum: limit=1000 wird verwendet → nicht alle Daten, aber auch keine sinnvolle Aggregation
- Bei 24h: ~580 Punkte zurueck (bei 60s-Intervall ca. 1440 moeglich → nur ~40% der Daten)

**Performance-Messung:**
- 24h-Abfrage: ~200ms (akzeptabel)
- 7d-Abfrage: ~500ms (noch akzeptabel, aber limit=1000 bedeutet Datenverlust)

**Empfehlungen:**

| Option | Aufwand | Empfehlung |
|--------|---------|------------|
| A: Server-Aggregation (resolution=5m → min/max/avg pro 5min) | Mittel (2-3d) | **EMPFOHLEN** — Skalierbar, korrekte Statistiken |
| B: Frontend-Downsampling (alle Punkte laden, im Browser aggregieren) | Gering (1d) | Kurzfristig OK, skaliert nicht |
| C: TimescaleDB / Materialized Views | Hoch (1w+) | Langfristig fuer grosse Datenmengen |

### T18-V2-22 — Fehlende Statistik-Anzeige

**Ergebnis:** KEINE Statistik-Anzeigen vorhanden

- LineChartWidget: Zeigt KEIN Min/Max der angezeigten Daten
- HistoricalChartWidget: Zeigt KEINE statistische Zusammenfassung
- Keine Tagesdurchschnitte oder Trendlinien
- Stats-Endpoint existiert (`GET /sensors/data/stats/by-source`) aber wird in keinem Widget verwendet
- **Gap:** Fuer professionelle Pflanzenzucht sind Min/Max/Avg essenziell:
  - Tagesmittel-Temperatur fuer VPD-Berechnung
  - Min/Max fuer Alarm-Korrelation
  - Trendlinie fuer Vorhersage (wird die Temperatur steigen/fallen?)

### T18-V2-23 — Fehlende Export-Funktionalitaet

**Ergebnis:** KEIN Sensor-Daten-Export vorhanden

- **Kein CSV-Export-Button** auf Charts
- **Kein PDF-/Screenshot-Export** fuer Dashboards
- **Existierende Export-API:** Nur `GET /v1/export/components` (WoT/AI-Format, nicht User-Daten)
- **Diagnostics-Export:** `GET /api/v1/debug/diagnostics-export` (System-Diagnose, nicht Sensor-Daten)
- Dashboard-JSON-Export existiert (Dashboard-Config, nicht Sensor-Daten)
- **Gap KRITISCH:** Fuer Bachelorarbeit und professionellen Gartenbau ist Datenexport ein Must-Have:
  - CSV mit Zeitstempel, Sensorname, Wert, Einheit, Qualitaet
  - Zeitraum-Selektion (von-bis)
  - Format-Optionen (CSV, JSON, Excel)

### T18-V2-24 — Dashboard-Sharing-Moeglichkeiten

**Ergebnis:** Backend vorbereitet, kein UI

- `is_shared: boolean` existiert auf Dashboard-Model (Backend + Frontend-Schema)
- Referenziert in 91 Frontend-Dateien (Typen, Stores, API-Calls)
- **KEIN dediziertes Sharing-UI:** Kein "Teilen"-Button, kein Share-Link-Generator, keine Public-URL
- **Multi-User:** Authentifizierung vorhanden (Login), aber kein rollenbasiertes Dashboard-Sharing
- **Gap:** Fuer Team-Nutzung (mehrere Gaertner) relevant, aber niedrige Prio fuer MVP

---

## Neue Findings

### F-V2-01 — Template-Dashboard-Erstellung defekt (HIGH)
- **Test:** T18-V2-00m
- **Beschreibung:** Dashboard aus Template oeffnet im View-Mode statt Edit-Mode, Template-Widgets fehlen (leeres Dashboard)
- **Auswirkung:** Templates sind funktionslos — User erhaelt immer ein leeres Dashboard
- **Empfehlung:** Fix in dashboard.store.ts → createFromTemplate() muss Widgets uebernehmen und isEditing setzen

### F-V2-02 — HistoricalChart zeigt raw_value statt processed_value (CRITICAL)
- **Test:** T18-V2-03
- **Beschreibung:** HistoricalChart.vue:122 verwendet `d.raw_value` statt `d.processed_value`. Y-Achse zeigt z.B. 26516 statt 40.5 %RH
- **Auswirkung:** Historische Charts sind unlesbar fuer Sensoren mit Verarbeitungs-Pipeline (SHT31, alle I2C-Sensoren)
- **Fix:** `HistoricalChart.vue:122` — `d.raw_value` → `d.processed_value ?? d.raw_value` (Fallback auf raw wenn processed fehlt)

### F-V2-03 — Debounce batcht nicht bei schnellen Aenderungen (LOW)
- **Test:** T18-V2-00f
- **Beschreibung:** Jede Widget-Aenderung startet einen neuen Debounce-Timer statt den laufenden zurueckzusetzen
- **Auswirkung:** Unnoetige Server-Calls, kein Datenverlust
- **Fix:** resetOnTrigger-Pattern im Debounce implementieren

### F-V2-04 — Kein Offline-Retry fuer fehlgeschlagene Syncs (MEDIUM)
- **Test:** T18-V2-11
- **Beschreibung:** Nach Netzwerk-Unterbrechung werden fehlgeschlagene PUT-Requests nicht nachgeholt
- **Auswirkung:** Aenderungen waehrend Offline-Phase fehlen auf dem Server bis zum naechsten Edit
- **Fix:** Retry-Queue mit exponential Backoff implementieren

---

## Datenvisualisierungs-Bewertung (1-5 pro Kriterium)

| Kriterium | Bewertung | Begruendung |
|-----------|-----------|-------------|
| Daten-Korrektheit | **2** | HistoricalChart zeigt raw_value statt processed_value (F-V2-02). Live-Charts korrekt. |
| Echtzeit-Reaktivitaet | **4** | WebSocket-Broadcast → sofortige Widget-Updates. 60-Punkte-Buffer fluessig. |
| Chart-Qualitaet | **3** | Chart.js-Standard, sauber. Fehlt: Zoom/Pan, Gap-Handling, Annotations. |
| Statistische Tiefe | **1** | Keine Min/Max/Avg-Anzeige, keine Trendlinien, Stats-Endpoint ungenutzt. |
| Responsive Design | **3** | Desktop gut, Laptop OK, Tablet knapp, kein Mobile. |
| Persistenz-Zuverlaessigkeit | **4** | Dual-Storage funktional, Orphan-Catch-Up, Claim-Flow. Kein Offline-Retry. |
| Redundanz-Freiheit | **3** | Schwellwerte doppelt konfigurierbar (Widget + Hardware). Widgets selbst sinnvoll differenziert. |

**Gesamtbewertung: 2.9 / 5.0** — Solide Basis, aber kritische Luecken bei Daten-Korrektheit und Statistik.

---

## Priorisierte Empfehlungsliste

| # | Empfehlung | Aufwand | Prio | Begruendung |
|---|-----------|---------|------|-------------|
| 1 | **F-V2-02 Fix: HistoricalChart processed_value** | 30 min | **CRITICAL** | Charts unlesbar fuer I2C-Sensoren. Einzeiler-Fix. |
| 2 | **F-V2-01 Fix: Template-Dashboard-Erstellung** | 2-4h | **HIGH** | Templates komplett defekt, User-Feature unbrauchbar. |
| 3 | **CSV-Export fuer Sensor-Daten** | 1-2d | **HIGH** | Must-Have fuer Bachelorarbeit und professionelle Nutzung. Endpoint + Button. |
| 4 | **Schwellwerte: Eine Stelle (SensorConfigPanel)** | 4h | **MEDIUM** | Redundanz entfernen, WidgetConfigPanel liest aus DB statt eigene Felder. |
| 5 | **Stats-Anzeige in Charts (Min/Max/Avg)** | 1d | **MEDIUM** | Stats-Endpoint existiert bereits, nur Frontend-Integration noetig. |
| 6 | **Resolution-Parameter auf GET /sensors/data** | 2-3d | **MEDIUM** | Performance bei 7d-Abfragen, korrekte Aggregation. |
| 7 | **Trend-Pfeile und Warnungs-Banner** | 1d | **LOW** | UX-Verbesserung fuer Quick-Glance-Monitoring. |
| 8 | **Chart Zoom/Pan** | 1d | **LOW** | Chart.js Zoom-Plugin, einfache Integration. |
| 9 | **Offline-Retry-Queue** | 1d | **LOW** | Robustheit bei instabiler Verbindung. |
| 10 | **Debounce Reset-on-Trigger** | 2h | **LOW** | Weniger Server-Calls bei schnellen Edits. |
| 11 | **Dashboard-Sharing UI** | 2-3d | **LOW** | Backend vorbereitet, UI fehlt. Fuer Team-Nutzung. |

---

## Vergleich mit professionellen IoT-Dashboards

### Was AutomationOne hat, was andere NICHT haben:

| Feature | AutomationOne | Grafana | ThingsBoard | Home Assistant |
|---------|--------------|---------|-------------|----------------|
| ESP32-direkte Integration | Ja (MQTT auto) | Nein (manuell) | Ja | Ja (ESPHome) |
| Auto-generierte Zone-Dashboards | Ja | Nein | Nein | Nein |
| Inline-Dashboard im Monitor | Ja | Nein | Nein | Nein |
| Widget-Target-System (Editor→Monitor) | Ja | Nein | Nein | Nein |
| Plant-aware Datenmodell | Ja (Zonen/Subzonen) | Nein | Nein | Nein |

### Was AutomationOne fehlt gegenueber Professionellen:

| Feature | Grafana | ThingsBoard | Home Assistant | AutomationOne |
|---------|---------|-------------|----------------|---------------|
| Zoom/Pan auf Charts | Ja | Ja | Ja | Nein |
| Zeitreihen-Aggregation (resolution) | Ja | Ja | Ja | Nein |
| CSV/PDF-Export | Ja | Ja | Ja | Nein |
| Min/Max/Avg Statistiken | Ja | Ja | Ja | Nein |
| Dashboard-Variables/Templating | Ja | Ja | Nein | Nein |
| Alerting mit Actions | Ja | Ja | Ja | Teilweise |
| Annotations auf Charts | Ja | Ja | Nein | Nein |
| Dashboard-Sharing/Public Links | Ja | Ja | Ja | Nein (Backend vorbereitet) |
| Mobile App | Nein | Ja | Ja | Nein |
| Datenretention/Downsampling | Ja | Ja | Ja | Nein |

### Fazit

AutomationOne hat ein **einzigartiges Plant-Management-Konzept** (Zonen, Auto-Dashboards, Monitor-Integration) das kein Konkurrent bietet. Die Schwaechen liegen in der **Datenanalyse-Tiefe** — genau dort, wo Grafana und ThingsBoard glaenzen. Die empfohlene Strategie:

1. **Kurzfristig (1 Woche):** F-V2-02 Fix + CSV-Export + Stats-Anzeige → macht das System fuer Bachelorarbeit nutzbar
2. **Mittelfristig (1 Monat):** Resolution-Parameter + Zoom/Pan + Sharing UI → bringt es auf ThingsBoard-Niveau
3. **Langfristig:** Dashboard-Variables, Annotations, Mobile App → Grafana-Paritaet (optional, da Grafana bereits integriert ist)

Die **Grafana-Integration** (bereits vorhanden im Docker-Stack) kann kurzfristig die Datenanalyse-Luecken schliessen, waehrend AutomationOne's eigene Dashboards auf Plant-Management und Quick-Monitoring fokussiert bleiben.

---

## Anhang: Screenshot-Verzeichnis

Alle Screenshots in `.claude/reports/current/T18-V2-screenshots/`:

| Datei | Test | Inhalt |
|-------|------|--------|
| T18-V2-00a-delete-button.png | T18-V2-00a | Widget-X-Button im Edit-Mode |
| T18-V2-00b-deeplink.png | T18-V2-00b | Deep-Link Selector-Sync |
| T18-V2-00c-server-sync.png | T18-V2-00c | Console: 26 Dashboards, 0 local-only |
| T18-V2-00d-empty-state.png | T18-V2-00d | Empty-State mit Bearbeiten-Button |
| T18-V2-00e-monitor-inline.png | T18-V2-00e | InlineDashboardPanel im Monitor |
| T18-V2-00g-auto-badge.png | T18-V2-00g | Auto-Badge im Selector |
| T18-V2-00h-zeitraum-chips.png | T18-V2-00h | Aktiver Zeitraum-Chip (blau) |
| T18-V2-00i-readonly.png | T18-V2-00i | Read-Only ActuatorCard im Monitor |
| T18-V2-01-line-chart-live.png | T18-V2-01 | Live-LineChart mit Echtzeit-Daten |
| T18-V2-02-gauge-widgets.png | T18-V2-02 | Gauge-Widgets Temperatur + Feuchte |
| T18-V2-03-historical-24h.png | T18-V2-03 | Historical mit RAW-Werten (Bug!) |
| T18-V2-04-multi-sensor.png | T18-V2-04 | Multi-Sensor Dual-Y-Achse |
| T18-V2-05-sensorcard-vs-gauge.png | T18-V2-05 | SensorCard vs. Gauge Vergleich |
| T18-V2-06-actuator-toggle.png | T18-V2-06 | ActuatorCard mit Toggle |
| T18-V2-07-esp-health.png | T18-V2-07 | ESP-Health Widget |
| T18-V2-08-alarm-list.png | T18-V2-08 | Alarm-Liste Widget |
| T18-V2-18a-1920.png | T18-V2-18 | Responsive Desktop 1920px |
| T18-V2-18b-1366.png | T18-V2-18 | Responsive Laptop 1366px |
| T18-V2-18c-1024.png | T18-V2-18 | Responsive Tablet 1024px |
| T18-V2-20-ideales-dashboard.png | T18-V2-20 | Ideales Dashboard-Layout |

---

*Bericht erstellt: 2026-03-10 | Agent: AutoOps T18-V2 | Status: Abgeschlossen*
*Naechster Schritt: F-V2-02 (HistoricalChart raw_value) fixen — 30min Aufwand, CRITICAL Prio*
