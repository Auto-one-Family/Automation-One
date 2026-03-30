# Auftrag R20-P8 — Dashboard UX: Alert-Sync, Aktor-Laufzeiten, Config-Flow

**Typ:** Feature-Erweiterung + UX-Fix — Frontend + Server
**Schwere:** HIGH (funktionale Luecken in Dashboard-Datenanbindung)
**Erstellt:** 2026-03-26
**Aktualisiert:** 2026-03-27 (verify-plan Korrektur)
**Ziel-Agent:** frontend-dev (Hauptarbeit), server-dev (API-Erweiterung)
**Aufwand:** ~6-8h (deutlich mehr als urspruenglich geschaetzt)
**Abhaengigkeit:** Keine blockierend, aber Actuator-History-API muss existieren

---

## verify-plan Korrekturen (2026-03-27)

> **R20-07 (Import/Export) ist KEIN Bug.** Verifizierung der Codebase zeigt:
> - `handleExport()` in `CustomDashboardView.vue:665` — VOLL FUNKTIONAL (JSON-Download)
> - `handleImport()` in `CustomDashboardView.vue:680` — VOLL FUNKTIONAL (File-Dialog + Parse)
> - `dashStore.exportLayout()` in `dashboard.store.ts:304` — Serialisiert Layout als JSON
> - `dashStore.importLayout()` in `dashboard.store.ts:311` — Parsed JSON, erstellt neues Layout
> - Buttons im Template (Zeilen 941-946) korrekt mit `@click` gebunden
>
> **Import/Export ist Architektur-relevant fuer Kaiser-Hierarchie** (God-Kaiser verteilt
> Dashboard-Configs an untergeordnete Kaiser-Instanzen). NICHT ENTFERNEN.
>
> **Neue Probleme identifiziert (TM-Feedback 2026-03-27):**
> 1. Dashboard-Widgets nutzen NICHT die Alert-Config-Thresholds (manuell vs. API-sync)
> 2. ActuatorRuntimeWidget ist nur ein On/Off-Status-Display, KEINE echte Laufzeit-Analyse
> 3. Keine Sensor-Aktor-Korrelationsansicht (z.B. Pumpe AN → Luftfeuchte steigt)

---

## Hintergrund

### Architektur-Kontext: God-Kaiser → Kaiser Hierarchie

Das System ist hierarchisch aufgebaut:
- **God-Kaiser** = Zentraler Server mit voller Kontrolle, KI-Auswertung, Datenbank
- **Kaiser** = Lokale Controller (Pi etc.) die ihre eigenen ESP32s verwalten
- **Import/Export** = Dashboard-Transfer zwischen Kaiser-Instanzen

Der God-Kaiser hat die komplette Verwaltung. Kaiser-Instanzen sind Netzwerk-Erweiterungen
die denselben Server-Code ausfuehren. Import/Export ermoeglicht es, Dashboard-Layouts
zwischen Instanzen zu teilen (z.B. ein optimiertes Gewaechshaus-Dashboard als Template
fuer neue Kaiser deployen). Diese Architektur ist sinnvoll und bleibt bestehen.

### Identifizierte Probleme

~~**R20-07 — Import/Export-Buttons nutzlos:**~~ UNGUELTIG — vollstaendig implementiert.

**R20-06 — Widget-Konfiguration umstaendlich:**
Die Konfiguration von Widgets erfordert zu viele Schritte oder ist nicht intuitiv
auffindbar. Hover-Toolbar-Funktion in allen Kontexten pruefen.

**NEU — Alert-Config nicht mit Dashboard-Widgets verbunden:**
Widget-Thresholds in `WidgetConfigPanel` (showThresholds, alarmLow/High, warnLow/High)
sind MANUELL einstellbar, werden aber NICHT aus der Server-AlertConfig API gezogen.
`AlertConfigSection.vue` verwaltet Alert-Configs pro Sensor/Aktor separat.
Zwei getrennte Systeme die dasselbe abbilden sollten.

**NEU — ActuatorRuntimeWidget zeigt KEINE echten Laufzeiten:**
Das Widget zeigt nur On/Off-Status + letzten Befehl (last_command_at). Es nutzt NICHT:
- `ActuatorState.runtime_seconds` (Server-DB-Feld vorhanden)
- `GET /{actuator_id}/runtime` (API-Endpoint vorhanden)
- `ActuatorHistory` Tabelle (Command-History Time-Series vorhanden)
- Kein Chart, keine Zyklen, keine Laufzeit-Berechnung

**NEU — Keine Sensor-Aktor-Korrelation:**
Kein Widget das z.B. Pumpen-Laufzeit gegen Luftfeuchte-Verlauf plottet.
Beispiel: Pumpe schaltet ein → Luftfeuchte steigt → Auswertung.
Die Daten existieren (SensorHistory + ActuatorHistory), aber kein Frontend-Widget
korreliert diese.

---

## IST-Zustand (verifiziert 2026-03-27)

### Import/Export — FUNKTIONAL (kein Handlungsbedarf)

| Element | Pfad | Status |
|---------|------|--------|
| Export-Handler | `CustomDashboardView.vue:665` | Funktional (JSON-Blob-Download) |
| Import-Handler | `CustomDashboardView.vue:680` | Funktional (File-Dialog + Parse) |
| Store exportLayout | `dashboard.store.ts:304` | Funktional (JSON-Serialisierung) |
| Store importLayout | `dashboard.store.ts:311` | Funktional (JSON-Parse + neues Layout) |
| Export-Button | `CustomDashboardView.vue:941` | Sichtbar, @click verbunden |
| Import-Button | `CustomDashboardView.vue:944` | Sichtbar im Edit-Modus, @click verbunden |

### Widget-Konfiguration (R20-06 — zu pruefen)

Die Hover-Toolbar in `InlineDashboardPanel` (mode="manage") hat Settings- und Trash-Icons.
Zu pruefen: Funktioniert in allen Kontexten (MonitorView L1/L2, CustomDashboardView)?

### Alert-Config → Dashboard-Widget Gap

| Komponente | Was sie tut | Problem |
|-----------|------------|---------|
| `AlertConfigSection.vue` | Per-Sensor Alert-Thresholds via API | Setzt Thresholds auf Server |
| `WidgetConfigPanel.vue:318-370` | Manuelle Threshold-Eingabe pro Widget | NICHT gesynct mit AlertConfig API |
| `GaugeWidget.vue:76` | Nutzt Threshold-Props fuer Farbzonen | Bekommt Daten nur aus WidgetConfig |
| `LineChartWidget.vue:28` | Threshold-Linien im Chart | Bekommt Daten nur aus WidgetConfig |
| Server `alert_config.py` | CustomThresholds Schema (warn/critical min/max) | Frontend-Widgets ignorieren dies |
| Server `sensors/{id}/alert-config` | GET/PUT Alert-Config pro Sensor | Nicht von Dashboard-Widgets genutzt |

**Kern-Problem:** Zwei parallele Threshold-Systeme ohne Synchronisation.

### ActuatorRuntimeWidget — Nur Status, keine Laufzeit

| Element | Vorhanden | Genutzt im Widget |
|---------|-----------|-------------------|
| `ActuatorRuntimeWidget.vue` | Ja | NUR On/Off + last_command_at |
| `ActuatorState.runtime_seconds` | Server-DB | NEIN |
| `GET /actuators/{id}/runtime` | Server-API | NEIN |
| `ActuatorHistory` Tabelle | Server-DB | NEIN |
| `runtime_stats` JSON-Feld | Server-DB | NEIN |
| Laufzeit-Chart | — | EXISTIERT NICHT |
| Zyklen-Zaehler | — | EXISTIERT NICHT |
| Korrelation mit Sensor | — | EXISTIERT NICHT |

### Vorhandene Server-Infrastruktur (nutzbar)

```
actuator_history (Tabelle)
  ├── esp_id, gpio, actuator_type
  ├── command_type (set, stop, emergency_stop)
  ├── value (0.0/1.0 fuer Relay, 0.0-1.0 fuer PWM)
  ├── timestamp (Time-Series optimiert)
  ├── success, error_message
  └── Indizes: esp_gpio_timestamp, command_type_timestamp

actuator_states (Tabelle)
  ├── current_value, target_value, state
  ├── last_command_timestamp
  ├── runtime_seconds (seit letzter Aktivierung)
  └── metadata (JSON)

API-Endpoints:
  GET  /actuators/{id}/runtime → runtime_stats
  PUT  /actuators/{id}/runtime → RuntimeStatsUpdate
```

---

## SOLL-Zustand

### ~~Fix 1 — Import/Export~~ ENTFAELLT

Import/Export funktioniert. Keine Aenderung noetig. Diese Buttons sind architektur-relevant
fuer die God-Kaiser → Kaiser Dashboard-Distribution.

### Fix 2 — Widget-Konfiguration pruefen (R20-06, unveraendert)

Pruefen ob die D4-Hover-Toolbar (`InlineDashboardPanel` mode="manage") korrekt
funktioniert:

1. Im CustomDashboardView: Settings-Icon auf Widget → WidgetConfigPanel oeffnet sich?
2. Im MonitorView L2: Hover auf Widget → Toolbar erscheint?
3. Im MonitorView L1 ZoneTile: Hover auf Mini-Widget → Toolbar erscheint?

Falls die Hover-Toolbar in einem Kontext nicht funktioniert: Debug warum (mode-Prop
falsch gesetzt? CSS-Overflow versteckt Toolbar?).

### Fix 3 — Alert-Config Threshold Sync (NEU)

**Ziel:** Wenn ein Sensor eine Alert-Config hat (customThresholds), sollen Dashboard-Widgets
diese automatisch als Default-Thresholds uebernehmen.

**Implementierung:**

1. **WidgetConfigPanel erweitern** (`WidgetConfigPanel.vue`):
   - Bei Sensor-Widgets: AlertConfig per API laden (`GET /sensors/{sensorId}/alert-config`)
   - "Schwellen aus Alert-Config uebernehmen" Button oder Auto-Sync Toggle
   - Mapping: `custom_thresholds.warning_min` → `warnLow`, etc.
   - User kann manuell ueberschreiben (AlertConfig = Default, nicht zwingend)

2. **Widget-Config Default-Population** (`dashboard.store.ts`):
   - Bei Auto-Generation (generateZoneDashboard): AlertConfig-Thresholds als
     Default-Werte in die Widget-Config schreiben

3. **Kein neuer API-Call im Widget selbst** — Thresholds werden einmalig beim
   Konfigurieren gesetzt, nicht bei jedem Render.

### Fix 4 — ActuatorRuntimeWidget: Echte Laufzeit-Analyse (NEU)

**Ziel:** Widget zeigt tatsaechliche Laufzeiten, Zyklen und Trends.

**Phase A — Laufzeit-Anzeige (Frontend):**

1. API-Call zu `GET /actuators/{actuator_id}/runtime` fuer runtime_stats
2. Anzeige: Gesamt-Laufzeit (h), aktuelle Session-Laufzeit, Zyklen-Zaehler
3. Horizontaler Balken: On-Time vs. Off-Time (prozentual)

**Phase B — Laufzeit-Chart (Frontend + evtl. Server-Erweiterung):**

1. `ActuatorHistory` abfragen (neuer API-Endpoint oder bestehender erweitern)
   - Zeitbereich: letzte 24h, 7d, 30d (konfigurierbar)
   - Daten: Timestamps + command_type (set/stop) + value
2. Timeline-Chart: Balken-Diagramm mit On/Off-Phasen
3. Tages-Aggregation: Laufzeit pro Tag als Balken

**Server-Erweiterung (falls noetig):**
- `GET /actuators/{actuator_id}/history?from=&to=&limit=` (falls nicht vorhanden)
- Oder: Aggregations-Endpoint `GET /actuators/{actuator_id}/runtime/daily`

### Fix 5 — Sensor-Aktor-Korrelations-Widget (NEU)

**Ziel:** In einem Chart zwei Zeitreihen ueberlagern: Sensor-Verlauf + Aktor-Status.
Beispiel: Luftfeuchte (Linie) + Pumpe On/Off (Balken/Bereich).

**Implementierung:**

1. Neuer Widget-Typ: `correlation-chart` (oder `MultiSensorWidget` erweitern)
2. Konfiguration: Sensor auswaehlen + Aktor auswaehlen
3. Dual-Y-Achse: Links Sensor-Wert, rechts Aktor-Status (0/1 oder PWM %)
4. Zeigt klar: "Wenn Pumpe einschaltet, steigt Luftfeuchte nach X Minuten"
5. Nutzt bestehende APIs: `sensor_data/history` + `actuator_history`

**Alternativ (einfacher):** `MultiSensorWidget` erweitern um auch Aktor-State-Timeline
als zweite Serie darzustellen.

---

## Priorisierung und Reihenfolge

| Prio | Fix | Aufwand | Abhaengigkeit |
|------|-----|---------|---------------|
| 1 | Fix 2 — Widget-Config UX (R20-06) | ~1h | Keine |
| 2 | Fix 3 — Alert-Config Threshold Sync | ~2h | Keine |
| 3 | Fix 4A — Runtime-Anzeige (Daten aus API) | ~2h | Runtime-API pruefen |
| 4 | Fix 4B — Runtime-Chart (History-Daten) | ~3h | Server: History-API |
| 5 | Fix 5 — Korrelations-Widget | ~4h | Fix 4B |

**Empfehlung:** Fix 2-3 zuerst (bestehende Luecken schliessen), dann Fix 4-5 als
zusammenhaengendes Feature "Aktor-Analytics".

---

## Einschraenkungen

- GridStack.js-Integration nicht veraendern
- `InlineDashboardPanel` mode-Prop-Logik bleibt unveraendert
- Keine neuen npm-Pakete
- Import/Export-Buttons NICHT entfernen (Architektur-relevant)
- Alert-Config-Sync: Nur als Default, User kann manuell ueberschreiben
- Korrelations-Widget: Erster Wurf kann einfach sein (Overlay in bestehendem Chart)

---

## Akzeptanzkriterien

- [ ] ~~Keine toten Buttons im Dashboard-Editor~~ ENTFAELLT (Buttons funktionieren)
- [ ] Widget-Konfiguration erreichbar in max 3 Klicks (Hover → Settings → Panel)
- [ ] Widget-Thresholds koennen aus Alert-Config uebernommen werden
- [ ] ActuatorRuntimeWidget zeigt echte Laufzeit-Daten (runtime_seconds, Zyklen)
- [ ] ActuatorRuntimeWidget hat Zeitreihen-Chart (On/Off Timeline)
- [ ] Korrelations-Ansicht: Sensor + Aktor in einem Chart
- [ ] `npm run build` ohne neue Fehler
- [ ] Server-Tests gruen nach API-Erweiterungen

---

> Erstellt von: automation-experte Agent
> Korrigiert von: verify-plan (2026-03-27)
> Roadmap-Referenz: R20-P8, ~~Bugs R20-06+R20-07~~ → R20-06 + neue Findings
