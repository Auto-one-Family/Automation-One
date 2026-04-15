# Phase 0 — UI/UX-Onboarding (IST, evidenzbasiert)

**Datum:** 2026-04-12  
**Zielgruppe:** Produktowner, externer UI/UX-Partner (Discovery vor erster Arbeitssession)  
**Scope:** Nur Dokumentation aus diesem Repository; keine Implementierung, keine Bewertung von Designs.

---

## 3.1 Produkt auf einen Blick

### Zielnutzer (aus Repo-Wording abgeleitet)

Das README beschreibt ein IoT-Framework zur **Steuerung von ESP32-basierten Sensor-/Aktor-Netzwerken** mit Fokus auf **Konfiguration ohne Firmware-Änderungen**, **Cross-ESP-Automation** und zentrale Datenhaltung — sprich Betriebsteams, die Anlagen technisch fahren und konfigurieren, nicht Endverbraucher einer Lifestyle-App.  
**Evidenz:** `README.md` — Vision („dynamische Steuerung … Nutzer können Sensoren/Aktoren per Frontend hinzufügen, Cross-ESP-Automationen erstellen“).

Die Oberfläche wird im Agent-Router explizit als **Operator-Dashboard** / Debug-/Kontextwerkzeug beschrieben (Begriff „Mission Control“ in der Sidebar-Dokumentation).  
**Evidenz:** `El Frontend/src/shared/design/layout/Sidebar.vue` — Blockkommentar „Mission Control Navigation“.

### Hauptnavigation (sichtbar)

**Globale Sidebar** (eingeloggter Nutzer; Admin-Zusatzblock nur bei Admin-Rolle):

| Sichtbarer Label (UI) | Ziel (`to` / implizite Route) | Rolle |
|----------------------|-------------------------------|--------|
| Dashboard | `/hardware` (aktiv auch für Pfade unter `/hardware`, `/monitor`, `/editor`) | alle |
| Regeln | `/logic` | alle |
| Komponenten | `/sensors` | alle |
| System | `/system-monitor` | Admin |
| Benutzer | `/users` | Admin |
| Kalibrierung | `/calibration` | Admin |
| Plugins | `/plugins` | Admin |
| Postfach | `/email` | Admin |
| Einstellungen | `/settings` | alle (Footer) |

**Evidenz:** `El Frontend/src/shared/design/layout/Sidebar.vue` — `RouterLink`-`to`-Attribute und `<span>`-Texte („Dashboard“, „Regeln“, „Komponenten“, … „Postfach“, „Einstellungen“).

**Zusätzliche Tab-Leiste** (oberhalb der drei Kernflächen Geräte / Monitor / Editor — URL-synchron):

- `Geräte` → `/hardware`
- `Monitor` → `/monitor`
- `Editor` → `/editor`

**Evidenz:** `El Frontend/src/components/common/ViewTabBar.vue` — Array `tabs` mit `path` und `label`.

**Seitentitel in der TopBar** kommen aus `route.meta.title` (Fallback `'Dashboard'`). Für Hardware-Routen ist `meta.title` = `Übersicht`, für Monitor `Monitor`, für Editor `Editor`, Logik `Automatisierung`, Komponenten-Route `Komponenten`, Systemmonitor `System Monitor`, Einstellungen `Einstellungen`, Postfach `E-Mail-Postfach`.  
**Evidenz:** `El Frontend/src/router/index.ts` — `meta: { title: '…' }` je Route; `El Frontend/src/shared/design/layout/TopBar.vue` — `pageTitle` aus `(route.meta.title as string) || 'Dashboard'`.

### Inkonsistenz-Ist (Benennung)

Dieselbe Fläche `/hardware` heißt in der **Sidebar** „Dashboard“, in der **Tab-Leiste** „Geräte“, im **Router-`meta.title`** „Übersicht“. Für externe UX-Dokumentation: ein Begriff, drei UI-Labels.  
**Evidenz:** `Sidebar.vue` (`<span>Dashboard</span>` + `to="/hardware"`), `ViewTabBar.vue` (`label: 'Geräte'`, `path: '/hardware'`), `router/index.ts` (`meta: { title: 'Übersicht' }` auf `hardware`).

### Kernaussagen „fertig vs. in Arbeit“ (nur README-IST)

Aus `README.md`, Abschnitt „Entwicklungsstand“ (Tabelle und Bulletlisten), ohne Ergänzung:

- **ESP32 Firmware:** „Production-Ready“ (README-Formulierung).
- **God-Kaiser Server:** „In Entwicklung“ — u. a. „MQTT-Layer vollständig, REST API teilweise implementiert, Database Layer fertig“.
- **Frontend:** „Debug-Dashboard“, „Production-Ready“ laut README-Tabelle; gleichzeitig nennt die Roadmap u. a. „Production User Dashboard (ersetzt Debug-Dashboard)“ und „Dashboard Builder für individuelle Oberflächen“ als geplante Punkte — d. h. das README positioniert das aktuelle UI explizit auch als Übergangs-/Debug-Funktion in Richtung späteres Produkt-Dashboard.
- **Weitere Zeilen** (Kaiser-Nodes, God Layer, KI): überwiegend „Konzept“ / geplant.

**Evidenz:** `README.md` — Abschnitte „Entwicklungsstand“, „Jetzt nutzbar“, „In aktiver Entwicklung“, „Roadmap“.

### Lücken (kein separates STATUS-Dokument)

Im Ordner `docs/` wurde **keine** dedizierte Datei mit Namensmuster `*STATUS*` gefunden (Suche per Werkzeug). Für „Reifegrad außerhalb README“: **Lücke — fehlt als zentrale Statusdatei im Repo** (abgesehen von README/AGENTS).

**Evidenz:** Suche `docs/**/*STATUS*` ergab 0 Treffer (Inventur 2026-04-12).

---

## 3.2 Was Moritz im Produkt wahrnimmt (Tabelle)

| Bereich / Route oder Tab | Nutzeraktion (1 Satz) | Erwartetes Nutzergefuehl (1 Satz) | Evidenz (Pfad) |
|---------------------------|------------------------|-----------------------------------|-----------------|
| **Geräte / Übersicht** — `/hardware`, `/hardware/:zoneId`, `/hardware/:zoneId/:espId` | Zonen aufklappen, ESP-Karten ansehen, in die Geräte-Detailansicht (Orbital) wechseln und Konfiguration über SlideOver/Panels öffnen. | Lagebild der Hardware-Topologie mit Fokus auf Zuordnung und Gerätekonfiguration statt reiner Messwert-Lesung. | `El Frontend/src/router/index.ts` (`path: 'hardware'` …); `El Frontend/src/views/HardwareView.vue` (Kommentar: Level 1 Zone Accordion, Level 2 ESP Detail); Kind: `El Frontend/src/components/esp/DeviceDetailView.vue` |
| **Monitor** — `/monitor`, `/monitor/:zoneId`, … | Zonen-Kacheln und ggf. Subzonen lesen, in Sensordetails (Zeitreihen) über SlideOver gehen. | Diagnose- und Überwachungsmodus ohne Konfigurationspflicht, zuerst aggregiertes Lagebild. | `router/index.ts` (`path: 'monitor'`); `El Frontend/src/views/MonitorView.vue` (Kommentar: „3 levels“, „read-only, no configuration“); Kind: `El Frontend/src/components/monitor/ZoneTileCard.vue` |
| **Editor (Dashboard-Builder)** — `/editor`, `/editor/:dashboardId` | Widgets auf dem Grid platzieren, konfigurieren, Layout speichern/laden. | Werkzeugkasten für individuelle Operator-Ansichten; laut Kommentar **kein separater Nur-Lese-Ansichtsmodus** im Builder. | `router/index.ts` (`path: 'editor'`); `El Frontend/src/views/CustomDashboardView.vue` (Kommentar: „kein separater Ansichtsmodus“); Kind: `El Frontend/src/components/dashboard-widgets/WidgetConfigPanel.vue` |
| **Dashboard-Anzeige eingebettet** | In der Hardware-Ansicht kann ein eingebettetes Dashboard-Panel genutzt werden (Kontext „Übersicht“). | Schneller KPI-Zugriff ohne den separaten Editor zu verlassen. | `El Frontend/src/views/HardwareView.vue` — Import `InlineDashboardPanel.vue`; Kind: `El Frontend/src/components/dashboard/InlineDashboardPanel.vue` |
| **Automatisierung / Regeln** — `/logic`, `/logic/:ruleId` | Regeln wählen, im Flow-Editor Knoten ziehen, Konfiguration am Knoten pflegen. | Visueller Regel-Editor (Node-RED-artig) für serverseitige Logik. | `router/index.ts` (`path: 'logic'`); `El Frontend/src/views/LogicView.vue` (Kommentar „Rules Editor“, „Node-RED-inspired“); Kind: `El Frontend/src/components/rules/RuleFlowEditor.vue` |
| **Komponenten-Inventar** — `/sensors` | Tabelle filtern/suchen, Detail-Panel öffnen; **keine** vollständige Geräte-Konfiguration wie in Hardware. | Wissens-/Bestandsübersicht über Sensoren, Aktoren und ESPs. | `router/index.ts` (`meta: { title: 'Komponenten' }`); `El Frontend/src/views/SensorsView.vue` (Kommentar: Wissensdatenbank/Inventar, explizit kein `SensorConfigPanel`) |
| **Einstellungen / Konto** — `/settings` | Accountdaten einsehen, abmelden, ggf. Benutzerverwaltung als Admin öffnen. | Persönliche Session- und Kontoverwaltung; UI-Teilstrings teils englisch („User Account“, „Username“). | `router/index.ts` (`path: 'settings'`); `El Frontend/src/views/SettingsView.vue` (`<h3>User Account</h3>`, `Username`, `Logout`-Fluss) |
| **Postfach** — `/email` | (Admin) E-Mail-Postfach-Verwaltung der Anwendung. | Operator-Backend-Funktion, nicht Teil der Standard-Navigation für Nicht-Admins. | `router/index.ts` (`path: 'email'`, `meta.title: 'E-Mail-Postfach'`, `requiresAdmin: true`); `El Frontend/src/views/EmailPostfachView.vue` |
| **Systemmonitor (Diagnose)** — `/system-monitor` | Tabs wie Ereignisse, Logs, MQTT, Health durchklicken; Live-Pause möglich. | Tiefe Betriebs- und Fehlerdiagnose mit Fokus auf Server- und Integrationsereignisse. | `router/index.ts`; `El Frontend/src/components/system-monitor/MonitorTabs.vue` — Tab-`label`s („Ereignisse“, „Server Logs“, … „Hierarchie“) |
| **Verbindung / Gerätestatus (sichtbar)** | WebSocket-Statuspunkt, Gerätezähler (Real/Mock/Offline), Pending-Badge, Not-Aus-Bereich, Alert-Leiste. | Cockpit-Feedback: sofort erkennbar, ob Datenfluss und Flotte „gesund“ wirken. | `El Frontend/src/shared/design/layout/TopBar.vue` — `connectionStatus` / Tooltip-Strings („Server verbunden“, …); `headerMetrics` (Real/Mock/Offline); `EmergencyStopButton`, `AlertStatusBar` |
| **Benachrichtigungen (keine eigene Top-Level-Route)** | Alert-Status in der TopBar; kein Sidebar-Eintrag „Benachrichtigungen“ als eigene Fläche identisch zu Postfach. | Alarme sind in die Kopfzeile integriert, kein separates Navigationsziel nur für „Inbox“ aller Nutzer. | `TopBar.vue` — `AlertStatusBar`; Sidebar listet kein `/notifications` (vgl. `Sidebar.vue`) |

### Legacy / nicht ausbauen (Redirect-Ziele)

Folgende **Pfade** existieren als Redirects oder Telemetrie-„Legacy“-Muster — für externes Design: **nicht als Ausbau-Ziel behandeln**, Ziel ist jeweils die neue Route laut Router.

**Evidenz:** `El Frontend/src/router/index.ts` — u. a. `path: 'custom-dashboard'` → `/editor`; `path: 'dashboard-legacy'` → `/hardware`; `path: 'devices'` → `/hardware`; `path: 'database'` → `/system-monitor?tab=database`; `path: 'sensor-history'` → `/monitor`; Kommentar „DEPRECATED“ bei mehreren Blöcken; zusätzlich `LEGACY_REDIRECT_PATTERNS` im selben File.

*(Hinweis: Views wie `SensorHistoryView.vue` / `MaintenanceView.vue` liegen weiter im `views/`-Ordner, sind für Nutzer aber über die aktuellen Entry-Routes nicht mehr die primären Einstiege.)*

---

## 3.3 Glossar (max. ein Absatz je Begriff, nur Repo-Belege)

### Zone

Im Hardware-Überblick sind **Zonen** die oberste Gruppierungsebene (Akkordeon), unter der ESP-Geräte als Karten erscheinen; Navigation kann über `/hardware/:zoneId` gezielt eine Zone ansteuern.  
**Evidenz:** `El Frontend/src/views/HardwareView.vue` — Dateikommentar (Route-Parameter, Zone Accordion).

### Subzone

Im **Monitor** beschreibt der Code Level 2 als **Subzonen-Akkordeon** mit Sensor-/Aktor-Karten unterhalb einer Zone — also eine feinere räumliche oder logische Gruppierung innerhalb einer Zone für das Lagebild.  
**Evidenz:** `El Frontend/src/views/MonitorView.vue` — Dateikommentar („L2 … Subzone accordion“).

### Sensor

**Mess-/Erfassungskomponente** an einem ESP; **feinkonfigurierbar** (Schwellen, Subzone, Kalibrierung, …) in der Hardware-Ansicht über dedizierte Panels — nicht über das flache Komponenten-Inventar.  
**Evidenz:** `El Frontend/src/views/SensorsView.vue` — Kommentar, dass Konfiguration in `HardwareView` (`SensorConfigPanel`) stattfindet; `El Frontend/src/views/HardwareView.vue` — Import `SensorConfigPanel.vue`.

### Aktor

Steuerbare **Ausgangs-/Stellgröße** (Pumpen, Ventile, … im Sinne des Frameworks); Konfiguration ebenfalls in der Hardware-Welt (`ActuatorConfigPanel`). Projektrichtlinie: Schaltaktionen mit Bestätigung, Not-Aus dauerhaft sichtbar — spiegelt sich in UI-Patterns wider.  
**Evidenz:** `El Frontend/src/views/HardwareView.vue` — Import `ActuatorConfigPanel.vue`; `.cursor/rules/frontend.mdc` — Safety-UI (ConfirmDialog, Emergency-Stop).

### Regeln (Automatisierung)

**Logik-Regeln** werden im **LogicView** als visueller Flow mit Knoten und Palette editiert („Node-RED-inspired“); Router-Titel `Automatisierung`. Sidebar-Label: **Regeln**.  
**Evidenz:** `El Frontend/src/views/LogicView.vue` — Kopfkommentar; `router/index.ts` (`meta: { title: 'Automatisierung' }`); `Sidebar.vue` — „Regeln“.

### Inkonsistenz-Ist (zusätzlich zu Zone/Navigation)

README-Architekturdiagramm nennt im Server-Block „**Vuetify | Frontend**“ als Komponente; der tatsächliche Codepfad des Dashboards ist **Vue 3 + Tailwind** (siehe README-Badge-Zeile und Frontend-Ordner). Externe Designer sollten das Diagramm **nicht** als Stack-Wahrheit lesen.  
**Evidenz:** `README.md` — Architektur-Abschnitt (Vuetify-Nennung) vs. README-Kopfzeile „Vue 3 + Tailwind“ / `El Frontend/`.

---

## 3.4 Willkommens-Checkliste für Robin (5–8 Punkte, repo-basiert)

Inhalt aus **`AGENTS.md`** und **`README.md`**, wo vorhanden; Lücken explizit markiert.

1. **Lokale Demo-Stack starten:** Docker-Netzwerk `shared-infra-net`, dann `docker compose up -d postgres mqtt-broker`, Backend mit dokumentierten `DATABASE_URL` / MQTT / `JWT_SECRET_KEY` / `ENVIRONMENT`, Frontend mit `VITE_API_URL` und `VITE_WS_URL` — Befehlsbeispiele stehen in `AGENTS.md`.  
2. **Erst-Admin / Testnutzer:** Einrichtung per `POST /api/v1/auth/setup` mit dokumentiertem JSON (`admin` / `Admin123!` / E-Mail) laut `AGENTS.md` („Gotchas“).  
3. **Ports dokumentiert:** Backend 8000, Frontend 5173, Postgres 5432, MQTT 1883/9001 — Tabelle in `AGENTS.md`.  
4. **ESP-Hardware optional:** `AGENTS.md` verweist auf Mock-ESPs über Debug-API für Entwicklung ohne physische Geräte.  
5. **Kein NDA-/Vertrags-Template im Repo gefunden** — **fehlt im Repo** (rechtliche Freigabe mit externem Designer extern klären).  
6. **Kein dedizierter „Designer-Onboarding“- oder Screenshot-Leitfaden** unter `docs/` für externe Sessions gefunden — **fehlt im Repo** (Screenshots/Storyboard vor Meeting manuell erstellen).  
7. **Security-/Production-Tiefgang nicht Teil dieses Berichts:** Für spätere Abnahme existiert eine dokumentierte Checkliste im Repo (JWT, MQTT-TLS, …).  
   **Evidenz:** `.claude/reference/security/PRODUCTION_CHECKLIST.md` — Einleitung („Documentation for future production deployment“).

---

## 3.5 Technischer Anhang (kurz)

### Vue-Umfang (Zählung)

- **187** `.vue`-Dateien unter `El Frontend/src/` (rekursive Inventur 2026-04-12).

**Grobe Kategorien (Dateianzahl je Ordner, nicht summiert = 187):**

| Kategorie (Beispielpfad) | Anzahl `.vue` |
|--------------------------|-----------------|
| `El Frontend/src/views/` | 19 |
| `El Frontend/src/components/esp/` | 24 |
| `El Frontend/src/components/system-monitor/` | 23 |
| `El Frontend/src/components/dashboard-widgets/` | 13 |
| `El Frontend/src/components/dashboard/` | 11 |
| `El Frontend/src/components/monitor/` | 5 |
| `El Frontend/src/components/rules/` | 5 |

**Evidenz:** Glob-Suche `El Frontend/src/**/*.vue` (187 Treffer); Teil-Ordner wie oben.

### Design-Tokens

Zentrale CSS-Variablen liegen in **`El Frontend/src/styles/tokens.css`** (laut Projektregeln in `.cursor/rules/frontend.mdc` explizit genannt).

### Tests (Vitest / Playwright)

- **Vitest:** Konfiguration `El Frontend/vitest.config.ts`; Unit-Tests z. B. unter `El Frontend/tests/unit/` (Komponenten, Stores, Utils).  
- **Playwright:** `El Frontend/playwright.config.ts`, `playwright.e2e-01.config.ts`, `playwright.css.config.ts`; Szenarien z. B. `El Frontend/tests/e2e/scenarios/hardware-view.spec.ts`, CSS/Design-Regression unter `El Frontend/tests/e2e/css/`.  
**Evidenz:** Dateipfade wie oben; `AGENTS.md` nennt `npx vitest run` und Testzahlen grob.

---

## Evidenz-Register (≥12 Kurzbelege, für Akzeptanzkriterien)

1. `El Frontend/src/router/index.ts` — `path: 'hardware'`, `name: 'hardware'`, `meta: { title: 'Übersicht' }`.  
2. `El Frontend/src/router/index.ts` — `path: 'monitor'`, `meta: { title: 'Monitor' }`.  
3. `El Frontend/src/router/index.ts` — `path: 'editor'`, `meta: { title: 'Editor' }`.  
4. `El Frontend/src/router/index.ts` — `path: 'logic'`, `meta: { title: 'Automatisierung' }`.  
5. `El Frontend/src/router/index.ts` — `path: 'sensors'`, `meta: { title: 'Komponenten' }`.  
6. `El Frontend/src/router/index.ts` — `path: 'settings'`, `meta: { title: 'Einstellungen' }`.  
7. `El Frontend/src/router/index.ts` — `path: 'email'`, `meta: { title: 'E-Mail-Postfach' }`, `requiresAdmin: true`.  
8. `El Frontend/src/shared/design/layout/Sidebar.vue` — `to="/hardware"` mit Label „Dashboard“.  
9. `El Frontend/src/components/common/ViewTabBar.vue` — `label: 'Geräte'`, `path: '/hardware'`.  
10. `El Frontend/src/views/MonitorView.vue` — Kommentar „read-only, no configuration“ und 3-Level-Beschreibung.  
11. `El Frontend/src/views/CustomDashboardView.vue` — Kommentar „immer Bearbeiten — kein separater Ansichtsmodus“.  
12. `El Frontend/src/views/SensorsView.vue` — Kommentar „Wissensdatenbank/Inventar“, Konfiguration nur in `HardwareView`.  
13. `README.md` — Tabellenzeile Frontend „Debug-Dashboard“ / „Production-Ready“ und Roadmap „Production User Dashboard“.  
14. `El Frontend/src/styles/tokens.css` — zentrale Token-Datei (Pfad).  
15. `El Frontend/vitest.config.ts` + `El Frontend/tests/e2e/` — Test-Infrastruktur-Pfade.

---

## Follow-up-Vorschläge (max. 5; getrennt von diesem IST-Bericht)

1. **Tiefen-Analyse Navigation:** Einheitliche Benennung „Dashboard“ vs. „Geräte“ vs. „Übersicht“ entscheiden und UI/Copy-Ist in Issue-Format dokumentieren (kein Code in Phase 0).  
2. **Implementierungs-Auftrag README-Diagramm:** Architekturgrafik an echten Stack (Vue/Tailwind, kein Vuetify) anpassen, um Onboarding-Risiko zu senken.  
3. **Tiefen-Analyse Monitor L2/L3:** KPI- und Subzone-Semantik anhand bestehender Analyseberichte unter `docs/analysen/` mit Designer-tauglichen „Nutzer erwartet …“-Szenarien fortführen.  
4. **Implementierung Production-Dashboard:** README-Roadmap-Punkte mit aktuellem `CustomDashboardView` und Redirect-Landschaft abgleichen (Produktowner-Entscheidung nötig).  
5. **Playwright-Design-Vertrag:** Bestehende `tests/e2e/css/*` als „nicht brechen“-Liste für externes Visual-Design (Workshop mit Frontend-Team).

---

*Ende des Phase-0-IST-Dokuments.*
