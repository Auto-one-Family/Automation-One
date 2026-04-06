# Analyseauftrag: El Frontend — vollständiges Inventar

**Datum:** 2026-04-05  
**Zielgruppe:** Du bist der ausführende Agent und arbeitest im **AutomationOne-Code-Repository**. Du liest und analysierst den Ordner `El Frontend/`. Du lieferst **einen** Markdown-Bericht im selben Repo.

**Ausgabedatei (Pflicht):** `.claude/auftraege/Auto_One_Architektur/frontend/bericht-frontend-inventar-<YYYY-MM-DD>.md` — setze das Datum auf den Tag der Fertigstellung.

**Regel zu Verweisen:** Verwende im Bericht **nur Pfade und Dateien innerhalb dieses Code-Repositories**. Keine Verweise auf externe Planungsordner, keine „siehe andere Dokumentation außerhalb des Repos“.

---

## Teil 1 — Kontext: Was du über El Frontend wissen sollst

Du sollst diesen Abschnitt als **fachliche Einordnung** nutzen. Wo der echte Code davon abweicht, gilt **der Code** — dann dokumentierst du die Abweichung explizit.

### 1.1 Rolle der Schicht

El Frontend ist die **dritte Schicht** von AutomationOne: eine **Vue-3-Anwendung mit TypeScript**, die Zonen, ESP-Geräte, Sensoren, Aktoren, Logikregeln, Dashboards und Betriebsfunktionen über **REST** und **WebSocket** gegen den zentralen Server steuert und anzeigt. Ziel des Produkts: Nutzer konfigurieren und überwachen **ohne Firmware-Code** auf dem ESP zu ändern.

### 1.2 Technologie-Stack (Erwartung — im Repo verifizieren)

| Bereich | Erwartete Technik | Was du prüfst |
|---------|-------------------|---------------|
| UI | Vue 3, TypeScript, `.vue`-Komponenten | `package.json`, `vite.config.ts` |
| State | Pinia | Stores unter `src/shared/stores/` und ggf. `src/stores/` — **beide** erfassen und die Rollen erklären |
| Styling | Tailwind, semantische Tokens (z. B. Glassmorphism) | `shared/design/`, `tokens.css`, Abweichungen (Hex, alte CSS-Variablen) listen |
| Charts | **Chart.js + vue-chartjs** | Nicht ECharts erwarten; falls doch etwas anderes vorkommt, als Befund melden |
| Dashboard-Editor | GridStack.js | Widget-Layout, Resize/Drag im Custom-Dashboard |
| Regeln | Vue Flow (o. Ä.) | Graphischer Rule-Builder |
| Tests | Vitest, ggf. Playwright | **Konvention:** Tests unter `El Frontend/tests/`, nicht unter `src/` — Abweichungen als **Drift** markieren |

### 1.3 Drei Hauptnutzungsbilder (Navigation im Kopf behalten)

1. **HardwareView** — Routenbasierter **3-Level-Zoom**: Zonenübersicht → Zonendetail mit Geräten → Gerätedetail (Orbital o. Ä.). URLs spiegeln den Zoom (Deep Links, Browser-Zurück). Hier liegt die **Gerätekonfiguration** inkl. Sensor/Aktor-Anbindung, soweit das Produkt das vorsieht.

2. **MonitorView** — **Überwachung**: Zonen, Live-Werte, eingebettete Dashboard-Ansichten. Trenne im Inventar strikt **Viewer** (Monitor) vom **Editor** (Custom Dashboard), anhand Routen und Imports.

3. **CustomDashboardView** — **Widget-Builder**: Nutzerdefinierte Dashboards, GridStack, mehrere Widget-Typen, Persistenz über Store/API.

### 1.4 Produktregeln, die du im Code nachweisen musst

**SensorConfigPanel**

- **Sinn:** Tiefgehende Sensor-Konfiguration in einem Panel (Felder je nach Typ, ggf. Kalibrierungsbezug).
- **Erlaubt:** Nur im **HardwareView-Ablauf** (typisch über Settings-Sheet / Orbital — **exakte Elternkomponenten** von dir listen).
- **Verbot:** **Kein** Einsatz in **SensorsView** (Route `/sensors`). Diese View ist die **Komponenten-Wissens-/Bestandsübersicht**, nicht derselbe Konfigurationskontext wie Hardware.
- **Deine Pflicht:** Alle Importe von `SensorConfigPanel` finden, Tabelle **Elternkomponente → Route/Kontext**. Explizite Aussage: Vorkommen in `SensorsView` ja/nein.

**Legacy-Dashboard**

- Es gibt oder gab eine **DashboardView** unter einer Legacy-Route (typisch `/dashboard-legacy`). Das ist **Altlast** gegenüber der Konsolidierung Hardware / Monitor / Custom Dashboards.
- **Deine Pflicht:** Im Router kennzeichnen, Redirects von alten URLs dokumentieren, nennen, wer Legacy noch importiert.

**Realtime**

- WebSocket läuft zentral (Composable oder Dispatcher). Events sind **benannt**. Du listest **alle** Namen aus dem Code und ordnest zu, welcher Store/Composable reagiert, und ob der State **gemerged** oder **ersetzt** wird.

### 1.5 Erwartbare Views und Routen (Hypothese — Router ist die Wahrheit)

Du erwartest nach Produktkonsolidierung etwa folgende Struktur. **Zähle und korrigiere** am echten Router:

| Logischer Name | Typische Routen | Rolle |
|----------------|-----------------|--------|
| HardwareView | `/hardware`, `/hardware/:zoneId`, `/hardware/:zoneId/:espId` | 3-Level-Zoom, Konfiguration |
| MonitorView | `/monitor` (+ ggf. verschachtelte Dashboard-Routen) | Monitoring |
| CustomDashboardView | `/dashboards`, `/dashboards/:id` | Editor |
| LogicView | `/logic`, `/logic/:ruleId` | Regeln |
| SystemMonitorView | `/system-monitor` | Ops-Tabs (Anzahl im Code zählen) |
| SensorsView | `/sensors` | Bestandsübersicht **ohne** SensorConfigPanel |
| CalibrationView | `/calibration` | Kalibrierung |
| PluginsView | `/plugins` | Plugins |
| SettingsView | `/settings` | Einstellungen |
| UsersView / UserManagementView | `/users` | Benutzer |
| LoginView | `/login` | Login |
| SetupView | `/setup` | Setup (falls vorhanden) |
| MaintenanceView | `/maintenance` | Wartung — Abgleich mit Sidebar/SystemMonitor |
| DashboardView | `/dashboard-legacy` (o. aktueller Legacy-Pfad) | **LEGACY** |

**Drift-Hinweis:** In älteren Ständen war `/` oft ein anderes Dashboard; SystemMonitor hatte weniger Tabs. Dein Bericht ersetzt solche Annahmen durch **IST aus dem Router**.

### 1.6 Erwartbare Pinia-Stores (Hypothese — vollständige Liste aus dem Code)

Du findest mindestens Stores zu: Dashboard/Widgets, Benachrichtigungen (ggf. zwei Bahnen: Toast + Inbox), ESP, Sensor, Aktor, Zone, Logic, Auth, Settings, Drag, Kalibrierung, Health, Plugin. **Dateinamen und zusätzliche Stores** nur aus dem Repo — die folgende Tabelle ist eine **Suchhilfe**, kein Limit:

`dashboard`, `notification`, `notification-inbox`, `esp`, `sensor`, `actuator`, `zone`, `logic`, `auth`, `settings`, `drag`, `calibration`, `health`, `plugin` (jeweils `.store.ts` o. Ä.).

### 1.7 Erwartbare Widget- und Ops-Bausteine (Namen im Code verifizieren)

- **Widgets (inhaltlich):** u. a. Line, Gauge, SensorCard, ActuatorCard, Historical, ESPHealth, AlarmList, ActuatorRuntime, MultiSensor, Konfig-Panel für Widgets — **jeweils echte `.vue`-Pfade** und Datenquellen angeben.
- **SystemMonitor:** Tabs wie Events, Logs, Database, MQTT, Health, Diagnostics, Reports — **exakte Komponentenpfade**.
- **Notifications / Alerts / FAB:** Badge, Drawer, Item, Preferences; Alert-Leiste; Quick-Action-Ball und Panels; Composable z. B. `useQuickActions` — **Importgraph** zu den Views.

### 1.8 Schnittstellen zum Server (markieren, nicht lösen)

Im Bericht **Aufrufpunkte** nennen (mit Pfad): zentrale Fehler-/Code-Übersetzung, WebSocket-Typdefinitionen vs. reale Event-Strings, UI-Stellen für **terminale Command-/Intent-Ergebnisse** (falls vorhanden) — Lücken benennen.

### 1.9 Drift-Register — was du am Ende mit IST-Zahlen schließt

| Thema | Auflösung durch dich |
|-------|----------------------|
| Anzahl Views | Im Code zählen; Redirects/Legacy separat |
| WebSocket-Events | Alle Strings aus dem Code extrahieren |
| Root-Route `/` | Router lesen |
| SystemMonitor-Tabs | Struktur der View zählen |
| SettingsView-Umfang | Datei lesen |

---

## Teil 2 — Bereichsmodell: So gliederst du den Bericht

Jede produktive Datei unter `El Frontend/src/` erhält genau **eine** Bereichs-ID (oder „Build/Config-only“ außerhalb von `src`).

| ID | Bereich | Orientierungspfad unter `src/` |
|----|---------|-------------------------------|
| F01 | App Shell & Routing | `App.vue`, `router/`, `main.ts`, Layout |
| F02 | Design System & globale Styles | `shared/design/`, globale Styles, Tailwind-Config (Repo-Wurzel) |
| F03 | State (Pinia) | `shared/stores/`, `stores/` |
| F04 | REST API Clients | `api/` |
| F05 | WebSocket & Realtime | Composables, Dispatcher, Store-Subscriptions |
| F06 | Hardware & Gerätekonfiguration | HardwareView, Orbital, Sheets, Sensor/Aktor-Panels |
| F07 | Monitor & Live-Ansicht | MonitorView, Sparklines, eingebettete Dashboards |
| F08 | Dashboard-Editor (Custom) | CustomDashboardView, Widgets, GridStack |
| F09 | Logic & Rule Builder | LogicView, Rules-Komponenten |
| F10 | Komponenten-Wissensbasis & Kalibrierung | SensorsView, CalibrationView |
| F11 | Systembetrieb & Administration | SystemMonitorView, Maintenance, Plugins, System-Config falls vorhanden |
| F12 | Auth, Benutzer, Einstellungen | Login, Users, Settings, Setup |
| F13 | Notifications, Alerts, Quick Actions | `notifications/`, `alerts/`, `quick-actions/` o. Ä. |
| F14 | Qualität: Tests & Tooling | `tests/` unter `El Frontend/` |

---

## Teil 3 — Tabellen, die du im Bericht ausfüllst

### 3.1 Globale Kennzahlen

| Metrik | Wert | Messmethode |
|--------|------|-------------|
| Views | | glob |
| Routen inkl. Redirects | | Router-Datei(en) |
| Komponenten `.vue` außerhalb `views/` | | glob |
| Pinia Stores | | `shared/stores` + `stores` |
| API-Module | | `api/*.ts` |
| Composables | | `composables` |
| WebSocket-Event-Namen (Anzahl + Liste im Anhang) | | Code-Extraktion |
| Unit-Tests / E2E-Tests | | `tests/` |

### 3.2 Master-Tabelle

Spalten: `Pfad`, `Bereich F01–F14`, `Rolle (View|Component|Store|API|Composable|Type|Test)`, `Kurzbeschreibung`, `Hauptabhängigkeiten`.

### 3.3 Store → API → WebSocket

Spalten: `Store`, `Actions`, `API-Datei(en)`, `WS-Events`, `Persistenz (ja/nein, wo)`.

### 3.4 View → direkte Kind-Komponenten (eine Ebene)

Pro View: wichtigste Imports — für Architektur-Walkthroughs.

---

## Teil 4 — Dein Auftrag (Ausführung)

### 4.1 Zielbild

Erstelle den Bericht so, dass ein Entwickler die **gesamte Frontend-Struktur allein aus dem Bericht** versteht, **ohne** das Repo zu öffnen.

Der Bericht enthält mindestens:

1. Vollständige Liste produktiver Quellen unter `El Frontend/` (ohne `node_modules`, ohne Build-Artefakte), gruppiert nach **F01–F14**.
2. **Router-Karte:** jede Route, Ziel-View, Lazy-Import, `meta` (Auth, Admin, Titel), Redirects; **Legacy** und **deprecated** klar (insbesondere Legacy-Dashboard und alte Aliasse).
3. **Komponenten-Inventar:** jede `.vue` unter `src/` — ein Satz Zweck, eine Bereichs-ID, direkte Abhängigkeiten (Stores, `api/*`, Composables).
4. **Store-Inventar:** State-Blöcke, Actions, API- und WS-Pfade, Nebenwirkungen (localStorage, Router).
5. **API-Schicht:** pro Datei in `src/api/` — Backend-Ressourcen, zentrale Fehler-Mapper falls vorhanden.
6. **WebSocket:** alle Event-Namen aus dem Code; Zuordnung zu Handlern; pro Event kurz **merge vs. replace**.
7. **Types:** `src/types/` und Kontraktdateien — Lücken zwischen Typen und realen WS-Events / Fehlercodes benennen (mit Pfad).
8. **Tests:** Abdeckung und verwaiste Pfade.
9. **Design-System:** Token-Dateien; Komponenten mit Hardcoded-Farben oder Legacy-Variablen (Suchergebnis).
10. **Cross-Cutting-Scorecard** pro View: Loading, Error, Empty, Sprachmix, A11y (Escape, Fokus).

### 4.2 Must-Haves (Abnahme)

- **G1:** Jede inhaltliche Aussage mit Repo-Pfad oder der Formulierung **„nicht im Code gefunden“**.
- **G2:** Hardware-, Monitor- und Custom-Dashboard-Routen klar von Legacy getrennt.
- **G3:** SensorConfigPanel: alle Importe; Bestätigung **kein** Einsatz in SensorsView (`/sensors`).
- **G4:** Jeder Store mit WebSocket: Eventnamen + Update-Semantik.
- **G5:** Testkonvention `El Frontend/tests/`; Abweichungen = Drift.

### 4.3 Erhebungsreihenfolge (befolge sie)

1. `El Frontend/package.json`, `vite.config.ts`, `tailwind.config.ts`, `tsconfig*.json`  
2. `El Frontend/src/router/`  
3. `El Frontend/src/views/`  
4. `El Frontend/src/shared/stores/` und `El Frontend/src/stores/`  
5. `El Frontend/src/api/`  
6. `El Frontend/src/composables/`  
7. `El Frontend/src/components/`  
8. `El Frontend/src/shared/design/`  
9. `El Frontend/src/types/`, `El Frontend/src/utils/`  
10. `El Frontend/tests/`  

Optional: `tree`, `rg` über `src/**/*.vue` und `src/**/*.ts`.

### 4.4 Checkliste vor Abgabe des Berichts

- [ ] Alle `.vue` in `components/` und `views/` sind F01–F14 zugeordnet.  
- [ ] Router vollständig transkribiert.  
- [ ] Alle WebSocket-Event-Strings extrahiert.  
- [ ] `SensorConfigPanel` und `ActuatorConfigPanel`: Eltern-Tabelle.  
- [ ] `shared/stores` vs. `stores` erklärt.  
- [ ] API-Funktionen den HTTP-Pfaden zugeordnet (Vergleich mit Backend im selben Repo optional).  
- [ ] Drift-Register (Abschnitt 1.9) mit **IST-Zahlen aus dem Code** geschlossen.  

---

Wenn du diesen Auftrag erfüllt hast, liegt die Wahrheit über das Frontend in **deiner Ausgabedatei** unter `.claude/auftraege/Auto_One_Architektur/frontend/`. Spätere Einzelaufträge können sich dann auf Bereichs-IDs und Pfade aus diesem Bericht stützen.
