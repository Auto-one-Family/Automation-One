# TM-Steuerung: Frontend-Durchleuchtung El Frontend (F01-F14)

**Stand:** 2026-04-05  
**Basis:** `bericht-frontend-inventar-2026-04-05.md` (IST), Frontend-Bereichsmodell F01-F14, Architekturrolle El Frontend im 3-Schichten-System.  
**Ziel:** Einzelne, fokussierte Analyseauftraege fuer Agenten, damit jeder logische Frontend-Bereich vollstaendig durchleuchtet wird (Codepfade, interne Kommunikation, Server-Kommunikation, UX, Design, Sicherheit, Netzwerkeffekte, Tests).

---

## 0. Vorbedingungen (vor Start jedes Auftrags)

1. **Codebasis:** Nur im AutomationOne-Code-Repo arbeiten (`El Frontend/` als Root fuer den Analyse-Scope).
2. **Analysemodus:** Kein Refactoring im Auftrag, nur beweisbasierte Durchleuchtung (mit Pfaden/Funktionen/Dateien).
3. **Report-Pfad pro Auftrag:**  
   `.claude/reports/current/frontend-analyse/report-frontend-<F-ID>-<kurztitel>-YYYY-MM-DD.md`
4. **Pflichtoutput pro Auftrag:**  
   - Pfadatlas (Entry -> Verarbeitung -> State -> UI-Ausgabe -> Folgeereignis)  
   - Contract-Matrix (REST/WS/Store/Type)  
   - Gap-Liste (P0/P1/P2)  
   - Folgeauftraege (konkret umsetzbar)
5. **Abnahmegrundsatz:** Keine Aussage ohne Codeanker (Datei + Symbol/Funktion + beobachtete Wirkung).

---

## 1. Ober-Referenzen (in jedem Einzelauftrag zitieren)

| Rolle | Referenz |
|------|----------|
| Gesamtinventar (IST) | `El Frontend/.claude/auftraege/Auto_One_Architektur/frontend/bericht-frontend-inventar-2026-04-05.md` |
| Ursprungsanalyseauftrag | `El Frontend/.claude/auftraege/Auto_One_Architektur/frontend/analyseauftrag-el-frontend-komplett-inventar-2026-04-05.md` |
| Router-Realitaet | `El Frontend/src/router/index.ts` |
| Store-Landschaft | `El Frontend/src/shared/stores/`, `El Frontend/src/stores/` |
| WS-Contractliste | `El Frontend/src/stores/esp-websocket-subscription.ts`, `El Frontend/src/utils/contractEventMapper.ts` |

---

## 2. Empfohlene Ausfuehrungsreihenfolge

**Reihenfolge fuer Agentenlauf:**  
`F01 -> F03 -> F04 -> F05 -> F06 -> F07 -> F08 -> F09 -> F10 -> F11 -> F12 -> F13 -> F02 -> F14`

Begruendung:
- Erst Navigations-/State-/Schnittstellenkern klaeren, dann Feature-Bereiche.
- Design (F02) nach funktionalen Bereichen auswerten, um echte Drift-Hotspots zu priorisieren.
- Tests/Tooling (F14) am Ende nutzen, um Cross-Checks ueber alle Findings zu ziehen.

---

## 3. Einzelauftraege (direkt an Agenten)

Jeder Block ist 1:1 als eigener Agentenauftrag nutzbar.

### F01 - App Shell, Routing, Guards, Navigationsautoritaet

**Scope:** `App.vue`, `main.ts`, `src/router/index.ts`, `shared/design/layout/AppShell.vue`, Sidebar/TopBar/Tabbar-Navigation.

**Aufgaben:**
1. Route-Graph vollstaendig kartieren (inkl. Redirects, Legacy, Catch-all, meta).
2. Guard-Entscheidungen pruefen (Setup-Pflicht, Auth, Admin, Fallback-Verhalten).
3. Deep-Link-Verhalten fuer Hardware-/Monitor-/Editor-Pfade analysieren.
4. Navigation vs. Nutzerrolle validieren (welche Menuepunkte wann sichtbar).

**Kommunikation, die nachzuweisen ist:**
- User-Interaktion (Click/Route) -> Router Guard -> Store/Auth-Pruefung -> Zielview.
- Legacy-URL -> Redirect -> heutiger Zielpfad.

**Deliverables:** Routenkarte, Guard-State-Matrix, Redirect-Driftliste.

**Abnahme:** Keine Route ohne Zielzuordnung; alle Admin-Pfade explizit klassifiziert.

---

### F02 - Design-System, Styles, Tokens, visuelle Konsistenz

**Scope:** `src/shared/design/**`, `src/styles/**`, `src/style.css`, `tailwind.config.ts`, relevante `.vue` mit Hardcoded-Farben.

**Aufgaben:**
1. Token-Hierarchie und semantische Layer dokumentieren.
2. Hardcoded-Farbdrift (`#rrggbb`) gegen Token-Regeln quantifizieren.
3. Komponenten-Patterns (Primitives -> Compound -> View) kartieren.
4. A11y-nahe Stilthemen (Kontrast, Fokuszustand, disabled/read-only semantics) pruifen.

**Kommunikation, die nachzuweisen ist:**
- Store/UI-State -> CSS-Klassen/Tokens -> sichtbarer Status fuer User.
- Error/Warning/Success-Farbcodes -> semantische Bedeutung.

**Deliverables:** Token-Map, Drift-Hotspotliste, Priorisierung fuer Style-Hardening.

**Abnahme:** Jeder Drift-Hotspot mit betroffenem UI-Kontext und Risiko.

---

### F03 - Pinia-Architektur und State-Ownership

**Scope:** `src/shared/stores/*.store.ts`, `src/stores/esp.ts`, `src/stores/esp-websocket-subscription.ts`.

**Aufgaben:**
1. Vollstaendige Store-Liste mit Owner-Rolle (SSoT/Derived/Transient) erstellen.
2. Inter-Store-Kommunikation (Aufrufe, Ketten, Seiteneffekte) aufschluesseln.
3. Persistente Client-States (localStorage/session) und Risiken erfassen.
4. Merge-vs-Replace-Strategien pro Kernentity (Device/Sensor/Actuator/Notification) pruefen.

**Kommunikation, die nachzuweisen ist:**
- REST-Response -> Store-Mutation -> View-Reaktivitaet.
- WS-Event -> esp-store dispatch -> Domain-Store update -> UI-Auswirkung.

**Deliverables:** Ownership-Matrix, Inter-Store-Callgraph, Mutationsemantik.

**Abnahme:** Fuer jeden produktiven Store sind Inputs/Outputs und Risiken dokumentiert.

---

### F04 - REST-API-Schicht und HTTP-Vertragsklarheit

**Scope:** `src/api/*.ts`, zentrale API-Initialisierung, Interceptors, Error-Parsing.

**Aufgaben:**
1. API-Module entlang Ressourcengrenzen kartieren (Auth, ESP, Sensor, Logic, Admin, Plugins usw.).
2. Fehlerpfad pruefen (HTTP -> parseApiError -> UI-Text/Codeuebersetzung).
3. Token-Refresh/Retry-Semantik im Request-Lebenszyklus analysieren.
4. Sichtbar machen, wo Frontend bereits terminale serverseitige Outcomes erwartet - und wo nicht.

**Kommunikation, die nachzuweisen ist:**
- View action -> API call -> Response/Error -> Store/UI.
- 401/403/5xx -> Interceptor -> Session-/Navigationseffekt.

**Deliverables:** Endpoint-Modulkarte, Fehlervertrag, Auth-Retry-Folgeanalyse.

**Abnahme:** Kein schreibender API-Pfad ohne Fehler- und Rueckmeldeverhalten.

---

### F05 - WebSocket, Realtime, Event-Contract

**Scope:** `services/websocket.ts`, `composables/useWebSocket.ts`, `stores/esp.ts`, WS-Typen/Mapper.

**Aufgaben:**
1. Eventkatalog aus Code extrahieren und gegen Typdefinitionen spiegeln.
2. Event-Verarbeitung pro Eventtyp dokumentieren (Handler, Mutationsart, Zielstore).
3. Reconnect, Filter, Subscription-Lebenszyklus und Race-Risiken analysieren.
4. Contract-Drift markieren (`MessageType` vs. reale Eventstrings, z. B. Contract-Warnsignale).

**Kommunikation, die nachzuweisen ist:**
- Server push -> WS client -> dispatch -> stores -> sichtbarer UI-Wechsel.
- WS-Ausfall -> Fallback/Anzeige -> Nutzerwirkung.

**Deliverables:** WS-Event-Matrix, Contract-Driftliste, Reconnect-Risikokatalog.

**Abnahme:** Alle produktiven Events besitzen Producer/Consumer-Zuordnung.

---

### F06 - HardwareView, Geraetekonfiguration, DnD auf Hardware-Ebene

**Scope:** `views/HardwareView.vue`, `components/esp/**`, `components/dashboard/ZonePlate.vue`, DnD-nahe Komponenten.

**Aufgaben:**
1. 3-Level-Hardwarefluss (Zone -> ESP -> Detail) mit UI-Triggern exakt kartieren.
2. SensorConfigPanel/ActuatorConfigPanel-Eltern- und Oeffnungspfade vollstaendig belegen.
3. Konfig-Workflows (Aendern, Speichern, Fehler, Rueckmeldung) end-to-end analysieren.
4. DnD/Sortierinteraktionen und deren Seiteneffekte auf Store/Server dokumentieren.

**Kommunikation, die nachzuweisen ist:**
- User-Klick/Drag -> Panel/Form -> API/WS -> Store -> visuelles Feedback.
- Orbital/Sheet-Interaktionen -> Folgezustaende in der Route/Ansicht.

**Deliverables:** Hardware-Interaktionsatlas, Config-Flow-Matrix, DnD-Risikoanalyse.

**Abnahme:** Kein Konfig-Trigger ohne Folgefluss bis zur Serverrueckmeldung.

---

### F07 - MonitorView und operative Live-Ansichten

**Scope:** `views/MonitorView.vue`, `components/monitor/**`, Monitor-relevante Device-Cards/Charts.

**Aufgaben:**
1. Monitor-L1/L2/L3-Navigations- und Datenflusskartierung.
2. Live-/Historie-Datenpfade trennen (welches Widget liest was, wann, woher).
3. Empty/Error/Loading-Strategien je Monitorzustand erfassen.
4. DeviceContext/ZoneContext-Wechsel und deren Auswirkungen auf Datenabfragen pruefen.

**Kommunikation, die nachzuweisen ist:**
- Context-Wechsel -> API/Store refresh -> Monitor-Widgets.
- Live-Event -> Card/Chart update -> Alarm/Alert-Signal.

**Deliverables:** Monitor-Datenflussatlas, Zustandsverhaltenstabelle, UX-Risiken.

**Abnahme:** Jeder Monitor-Hauptpfad hat klare Datenquelle und Fehlerverhalten.

---

### F08 - Custom Dashboard Editor, Widgets, GridStack, Drag-and-Drop

**Scope:** `views/CustomDashboardView.vue`, `components/dashboard-widgets/**`, `DashboardViewer`, `useDashboardWidgets.ts`.

**Aufgaben:**
1. Editor-Lebenszyklus (laden, erstellen, bearbeiten, speichern, wechseln) analysieren.
2. GridStack-DnD/Resize-Ereignisse bis Persistenz nachvollziehen.
3. Widget-Registry, Widget-Konfiguration und Datenquellen je Widgettyp dokumentieren.
4. Konfliktthemen zwischen Editorzustand und Live-Deviceupdates bewerten.

**Kommunikation, die nachzuweisen ist:**
- Widget-Interaktion -> Store -> API persist -> Reload/Replay.
- Device-Realtime -> Widget-Rendering -> visuelle Konsistenz.

**Deliverables:** Editor-State-Machine, Widget-Matrix, DnD-Persistenzvertrag.

**Abnahme:** Jeder Widgettyp hat dokumentierte Inputs, Trigger und Speichereffekte.

---

### F09 - Logic UI, Regelmodell, Ausfuehrungsfeedback

**Scope:** `views/LogicView.vue`, `components/rules/**`, `shared/stores/logic.store.ts`, logiknahe Typen.

**Aufgaben:**
1. Rule-Lebenszyklus im Frontend (CRUD, Validation, Aktivierung, Historie, Undo) erfassen.
2. UI-Darstellung fuer Regelstatus vs. Hardwarefinalitaet auseinanderziehen.
3. Logic-Execution-Realtimepfad (inkl. direkter WS-Subscriptions) pruefen.
4. Prioritaets-, Konflikt- und Fehlersignale im UI auf Konsistenz analysieren.

**Kommunikation, die nachzuweisen ist:**
- Rule edit -> API save -> server execution -> WS feedback -> UI.
- Logic error/validation -> Nutzerhinweis -> korrigierbarer Zustand.

**Deliverables:** Logic-Contractbild, Feedback-Lueckenliste, Finalitaetsklarheit.

**Abnahme:** Sichtbar, wo UI "accepted" von "final wirksam" trennt oder vermischt.

---

### F10 - Komponenten-Wissensbasis, Inventar und Kalibrierung

**Scope:** `views/SensorsView.vue`, `components/inventory/**`, `views/CalibrationView.vue`, `components/calibration/**`.

**Aufgaben:**
1. SensorsView-Rolle als Wissens-/Inventarbereich (nicht Hardware-Konfiguration) validieren.
2. Inventar-Tabellen, Detailpanel, Such-/Filter-/Kontextaenderungen kartieren.
3. Kalibrierungsflows inkl. Admin-Rechte und Serverkommunikation dokumentieren.
4. Schnittstelle Inventar <-> Hardware/Monitor (Navigation, Kontextuebergabe) pruefen.

**Kommunikation, die nachzuweisen ist:**
- Inventaraktion -> API/Store -> UI-Rueckmeldung.
- Kalibrierung -> serverseitige Bestaetigung -> Sichtbarkeit in Komponentenstatus.

**Deliverables:** Inventar/Kalibrierungsfluss, Rollenabgrenzung SensorsView-HardwareView.

**Abnahme:** SensorConfigPanel-Nichtnutzung in SensorsView explizit nachgewiesen.

---

### F11 - Systembetrieb, Ops, Plugins, Diagnostics

**Scope:** `views/SystemMonitorView.vue`, `components/system-monitor/**`, `components/database/**`, `views/PluginsView.vue`, `views/SystemConfigView.vue`, `views/LoadTestView.vue`, `views/EmailPostfachView.vue`.

**Aufgaben:**
1. Ops-Tabstruktur und Datenquellen pro Tab vollstaendig auflisten.
2. Betriebsereignisse (logs/events/mqtt/health/diagnostics/reports/hierarchy) in Eventgruppen und Abhaengigkeiten aufteilen.
3. Plugin-/SystemConfig-/LoadTest-/Email-Views auf Rechte, Fehlerpfade, Nebenwirkungen pruefen.
4. Deprecated-Pfade (`/maintenance`, alte Ops-Routen) und aktuelle Entry-Punkte klar abgrenzen.

**Kommunikation, die nachzuweisen ist:**
- Ops-Filter/Tabwechsel -> Query/Realtime -> Tabellen/Panels.
- Plugin/Diagnose-Trigger -> server task -> Ergebnis-/Statusanzeige.

**Deliverables:** Ops-Pfadatlas, Rechte-/Risiko-Matrix, Legacy-Cleanup-Liste.

**Abnahme:** Alle Admin-Oberflaechen mit Sicherheits- und Bedienrisiko bewertet.

---

### F12 - Authentifizierung, Benutzerverwaltung, Einstellungen, Setup

**Scope:** `views/LoginView.vue`, `SetupView.vue`, `SettingsView.vue`, `UserManagementView.vue`, `auth.store.ts`, `api/auth.ts`, `api/users.ts`.

**Aufgaben:**
1. Login/Refresh/Logout-Lebenszyklus inklusive Tokenhaltung und Guard-Folgen pruefen.
2. Rollen-/Rechtewirkung in Navigation und API-Nutzung durchleuchten.
3. Usermanagement-Flow (CRUD/Status/Fehler) und Auditierbarkeit bewerten.
4. Einstellungen: lokale vs. serverseitige Persistenz und Seiteneffekte dokumentieren.

**Kommunikation, die nachzuweisen ist:**
- Auth-Events -> Store -> Router -> Sichtbarkeit von Views.
- User-Aktion -> API -> Success/Error -> UI + eventuelle Realtime-Auswirkung.

**Deliverables:** Auth-Sicherheitsbild, Rollenmatrix, Session-Risiken.

**Abnahme:** Kein Auth-kritischer Pfad ohne Failure- und Recovery-Verhalten.

---

### F13 - Notifications, Alerts, Quick Actions, UX-Reaktionssystem

**Scope:** `components/notifications/**`, `components/quick-action/**`, alert-center/notification Stores.

**Aufgaben:**
1. End-to-end-Kette fuer Notifications (WS/REST -> Inbox/Toast -> Useraktion) kartieren.
2. Alert-Priorisierung, unread-zaehlung, acknowledged/read-Status und Persistenzverhalten pruefen.
3. Quick-Action-Interaktionen (FAB, Panels) inkl. Sicherheits-/Fehlbedienrisiken dokumentieren.
4. Event-Fatigue-Risiken (Spam, Duplikate, fehlende Deduplizierung) bewerten.

**Kommunikation, die nachzuweisen ist:**
- Serverevent -> NotificationStore -> Drawer/Badge/Toast -> User-Aktion -> API.
- QuickAction trigger -> Zielworkflow (Hardware/Monitor/Logic) -> Rueckmeldung.

**Deliverables:** Notification-Lifecycle-Matrix, UX-Warnlogik, Prioritaetsmodell.

**Abnahme:** Kritische Alerts sind eindeutig von rein informativen Events trennbar.

---

### F14 - Tests, Tooling, Qualitaetsnetz

**Scope:** `tests/unit/**`, `tests/e2e/**`, `tests/mocks/**`, `vitest.config.ts`, `playwright*.ts`, Build/Test-Skripte.

**Aufgaben:**
1. Testabdeckung auf Bereich F01-F13 mappen (was ist abgedeckt, was fehlt).
2. E2E-Szenarien auf zentrale Nutzerreisen pruefen (Hardware, Monitor, Editor, Auth, Admin).
3. Mock-Strategie fuer WS/API auf Driftpotenzial gegen echte Contracts bewerten.
4. Fehlende Regressionstests fuer P0/P1-Gaps in backlog-faehige Testauftraege ueberfuehren.

**Kommunikation, die nachzuweisen ist:**
- Testfall -> Simulierter Input -> erwartete Store/UI-Reaktion.
- Mock-Event -> reales Eventschema (Abweichungsanalyse).

**Deliverables:** Coverage-Heatmap, Testlueckenliste, Priorisierte Testauftragsserie.

**Abnahme:** Fuer jeden P0/P1-Fund gibt es einen konkreten Testauftrag.

---

## 4. Querschnittsfragen (in jedem Auftrag mitpruefen)

1. **Intern:** Welche Funktionen/Stores/Composables reden direkt miteinander, welche implizit ueber Side-Effects?
2. **Server:** Welche Interaktionen laufen ueber REST, welche ueber WS, welche hybrid?
3. **Finalitaet:** Wo zeigt UI nur "angenommen", wo "wirklich abgeschlossen"?
4. **Sicherheit:** Auth/Rollen, sensible Aktionen, Fehlbedienungsschutz, Admin-Gates.
5. **Interaktion:** Tabs, Panels, Drag-and-drop, Modals, Tastaturwege, Mobile/Responsive-Folgen.
6. **Netzwerk:** Verhalten bei Latenz, WS-Disconnect, API-Fehlern, Teilwiederanlauf.
7. **Design:** Konsistenz mit Tokens, semantischen Farben und Komponenten-Patterns.

---

## 5. Standard-Abschlussformat pro Agentenreport

1. **Kurzurteil (max. 12 Bulletpoints)**
2. **Pfadbeweise (happy path + stoerfall)**
3. **Contract-/Kommunikationsmatrix**
4. **Top-Findings P0/P1/P2**
5. **Konkrete Folgeauftraege (umsetzbar, priorisiert)**

Wenn ein Report diese 5 Punkte nicht enthaelt, gilt der Auftrag als nicht abgenommen.

---

## 6. Kurztext fuer Agentenvergabe

**Betreff:** El Frontend - Auftragsserie F01-F14 fuer vollstaendige Architektur-Durchleuchtung  
**Hinweis an Agent:** Arbeite streng beweisbasiert im Frontend-Code. Ziel ist eine vollstaendige Architekturklarheit inklusive interner Kommunikation, Server-Kommunikation, UX-Interaktionen, Security, Design und Realtime-Verhalten.

---

*Ende Steuerdokument.*
