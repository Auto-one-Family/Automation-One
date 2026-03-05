# Auftrag: Trockentest — Layout, Zonendarstellung, Subzones, Komponenten-Tab & Systemkontext

**Ziel-Repo:** auto-one  
**Kontext:** Systematischer Trockentest mit Fokus auf Layout und Funktionalität: neue Integration Zonendarstellung + Subzones, Zusammenspiel in Dashboard-Übersicht und Monitor. Zusätzlich vollständiger Durchklick des Komponenten-Tabs (KI-Plattform) inklusive aller Einstellungen. Alle gefundenen Fehler (Layout, Backend, Navigation, Verlinkungen, Einstellungen) werden in EINEM Bericht erfasst.  
**Bezug:** Ausführender Agent (z. B. frontend-debug, generalPurpose); AutoOps beauftragt; Playwright MCP + voller Stack; serverzentrischer Systemkontext. (Hinweis: Es gibt keinen Agent namens „automation-experte“ im Repo.)  
**Priorität:** Hoch  
**Datum:** 2026-03-03  
**Ergebnis:** EIN konsolidierter Bericht mit ALLEN Fehlern und exakten Orten (inkl. schlechter Verknüpfungen im Systemkontext).

---

## Wichtige Vorbemerkungen für den ausführenden Agenten

### Verhalten: Fokussiert, seitenweise, ohne Springen

- **Nicht springen.** Der Agent arbeitet sich **eine Seite/View komplett** durch, bevor er zur nächsten wechselt.
- **Jede Funktion** der jeweiligen Seite wird angeklickt bzw. durchlaufen; alle Einstellungen, Tabs, Modals, Links und Aktionen werden getestet.
- **Alles dokumentieren:** Jeder Fehler (Layout, Backend-Response, Navigation, Verlinkung, Einstellung) wird mit **genauem Ort** (View, Komponente, Route, API-Pfad, Zeile/Stelle wo sinnvoll) notiert.
- **Komponenten-Tab ist Pflicht:** Der Agent muss zwingend den **Komponenten-Tab** (**`/sensors`** — „Komponenten“ in der Sidebar) aufrufen und das **Inventar inkl. DeviceDetailPanel** durchklicken; die **vollständigen Geräte-Einstellungen** (Schwellen, Alert, Runtime, Subzone) liegen in **HardwareView** unter **`/hardware?openSettings=espId`** (SensorConfigPanel/ActuatorConfigPanel). Beides muss getestet werden; jede Fehlermeldung, jeder kaputte Link, jede inkonsistente Anzeige wird erfasst.

### Stack und Plugins

- **Playwright MCP** für Frontend-Interaktion (navigate, click, snapshot, console_messages, network_requests).
- **Voller Stack:** Backend (El Servador), Frontend (El Frontend), ggf. Mock-ESP/MQTT wenn für Reproduktion nötig.
- **Alle Plugins nutzen**, die dem Agenten zur Verfügung stehen; **AutoOps wird ausdrücklich beauftragt** (z. B. für Diagnose, Health-Check, System-Cleanup wo im Testkontext sinnvoll).
- **Server-Logs** bei jedem Backend-Fehler prüfen (`docker logs ...`, Correlation-ID wenn vorhanden).

### Ergebnisformat

- **Ein einziger Bericht** (z. B. `reports/current/trockentest-bericht-layout-zonen-komponenten-YYYY-MM-DD.md`) mit:
  - Kurzfassung (Anzahl Fehler pro Kategorie)
  - Pro Fehler: **Kategorie** (Layout / Backend / Navigation / Verlinkung / Einstellung / Sonstiges), **Ort** (View, Route, Komponente, API), **Beschreibung**, **Reproduktion** (optional), **Priorität** (Kritisch/Hoch/Mittel/Niedrig).

---

## Ist-Zustand (Relevanz für den Test)

| Bereich | Stand | Relevanz für diesen Test |
|--------|--------|---------------------------|
| Zonendarstellung + Subzones | Neue Integration; Layout-Monitor-Aufträge (Überschriften, Reihenfolge, Subzonen für Mock) vorhanden | Kern des Tests: Darstellung und Zusammenspiel prüfen |
| Dashboard-Übersicht | Zonen-Kacheln, Dashboards (N), Inline-Panels; Reihenfolge L1/L2 laut Auftrag anpassbar | Reihenfolge, Verlinkungen, Layout prüfen |
| Monitor | L1 = Zonen-Kacheln, L2 = Zonen-Detail (Sensoren/Aktoren, Zone-Dashboards); doppelte Zählung, Reihenfolge bekannt | Layout, Zählung, Verlinkungen, Subzone-Zeilen prüfen |
| Komponenten-Tab (/sensors) | SensorsView = flaches Inventar (InventoryTable + DeviceDetailPanel: Schema, Zone-Kontext, LinkedRules); volle Einstellungen (Schwellen, Alert, Runtime, Subzone) in HardwareView via `?openSettings=espId` (SensorConfigPanel/ActuatorConfigPanel) | **Inventar + DeviceDetailPanel + HardwareView-Config-Panels** durchklicken, jeden Fehler notieren |
| Serverzentrischer Systemkontext | Backend = Single Source of Truth; Verknüpfungen Frontend ↔ API ↔ MQTT/DB | Schlechte oder fehlende Verknüpfungen im Bericht aufführen |

**Referenz-Aufträge (keine Abarbeitung, nur Kontext):**
- `auftrag-layout-monitor-seite-ueberschriften-reihenfolge.md` — Layout Monitor (Zählung, Reihenfolge)
- `auftrag-subzonen-mock-geraete-analyse-integration.md` — Subzonen für Mock
- `auftrag-chaos-engineering-mock-volltest.md` — Playwright MCP, Mock, API-Checks
- `auftrag-komponenten-tab-wissensinfrastruktur.md` — Komponenten-Tab Vision/Kontext
- `systemueberblick-fuer-auto-one.md` — Stack, MCP, AutoOps, 7 Domains

---

## Konfigurierbare Bereiche im System (Stand Codebase)

| Bereich | Route / Ort | Was sich konfigurieren lässt |
|--------|-------------|------------------------------|
| **Dashboard (Übersicht)** | `/hardware` | Zonen-Filter, Status-Filter (online/offline/warning/safemode), Mock/Real, Pending Devices, Zone-Zuordnung; Klick auf ESP → SlideOver mit ESP-Einstellungen (öffnet via `?openSettings=espId`). |
| **Monitor L1** | `/monitor` | Zonen-Kacheln, cross-zone Dashboards; Navigation zu L2 (Zone). |
| **Monitor L2** | `/monitor/:zoneId` | Sektionen-Reihenfolge (Header, Sensoren, Aktoren, Zone-Dashboards, Inline-Panels); Subzone-Zeilen, Zählung; Links zu Sensor-Detail (L3), Config. |
| **Komponenten-Inventar** | `/sensors` | Suche, Filter (Typ, Status, Zone), Spalten; DeviceDetailPanel: typspezifische Metadaten (SchemaForm), Zone-Kontext (ZoneContextEditor), Verknüpfte Regeln; Link „Vollständige Konfiguration“ → `/hardware?openSettings=espId`. |
| **Vollständige Geräte-Config** | `/hardware` + `?openSettings=espId` | SensorConfigPanel / ActuatorConfigPanel: Name, Unit, Enabled, Subzone (SubzoneAssignmentSection); Schwellen, AlertConfig (Phase 4A.7); Runtime/Wartung (Phase 4A.8); Metadaten (DeviceMetadataSection); LinkedRules; Kalibrierung, Hardware (GPIO/I2C). |
| **Zone-Kontext (Backend)** | API `PUT/PATCH /api/v1/zone/context/{zone_id}` | Zyklus-Daten, Pflanzalter, Ernte, custom_data; Frontend: ZoneContextEditor (z. B. in DeviceDetailPanel bei Zone). |
| **Schema-Registry (Backend)** | `GET /api/v1/schema-registry/`, `GET /api/v1/schema-registry/{type}` | Device-Typen und JSON-Schema für Metadaten; Frontend nutzt lokale Schemas unter `El Frontend/src/config/device-schemas/`. |
| **Backups (Backend)** | `/api/v1/backups/...` | DB-Backup erstellen, auflisten, herunterladen, wiederherstellen (Audit-Bereich). |
| **Logic/Regeln** | `/logic` | Rules CRUD, Toggle, Test; Execution History. |
| **System-Monitor** | `/system-monitor` | Tabs: Health, Hierarchy, MQTT, Ereignisse, ggf. weitere; Admin-only. |

Dokumentation der Endpoints: `.claude/reference/api/REST_ENDPOINTS.md`, `WEBSOCKET_EVENTS.md`, `MQTT_TOPICS.md`.

---

## Testumfang (Seiten/Views in fester Reihenfolge)

Der Agent arbeitet die folgenden Blöcke **nacheinander** ab. Pro Block gilt: **Seite komplett durchklicken**, dann erst zum nächsten Block.

### Block 1: Dashboard-Übersicht (Haupt-Dashboard)

- **Route/View:** **`/hardware`** (HardwareView). Die Sidebar verlinkt „Dashboard“ auf `/hardware`; `/` leitet auf `/hardware` um. CustomDashboardView (GridStack-Editor) liegt unter `/custom-dashboard` und `/editor` und ist nicht die Haupt-Dashboard-Übersicht.
- **Zu prüfen:**
  - Zonen-Kacheln/Zone-Gruppierung: Darstellung, Klick zu Zone/ESP-Detail, Verlinkungen (inkl. `?openSettings=espId` für ESP-Einstellungen).
  - Filter (Mock/Real, Status), Pending Devices, Unassigned Drop-Bar.
  - „Dashboards (N)“-Karte und Inline-Dashboard-Panels (falls sichtbar): Reihenfolge, Lesbarkeit, Links.
  - Alle sichtbaren Links/Buttons: Ziel-Route, 4xx/5xx, Konsolenfehler.
  - Layout: Überlappungen, fehlende Abstände, kaputte Responsive-Ansicht (mind. eine Standard-Viewport-Größe).
- **Dokumentation:** Jeder Fehler mit Kategorie, Ort (Komponente/Route), Beschreibung.

### Block 2: Monitor — Ebene 1 (Übersicht)

- **Route/View:** **`/monitor`** (MonitorView, Ebene 1 = Zonen-Übersicht).
- **Zu prüfen:**
  - Zonen-Kacheln/Liste: Darstellung, Zählung, Reihenfolge.
  - „Dashboards (N)“ und Inline-Panels: Position (sollen nach Zonen kommen), Links, Fehler.
  - Navigation zu L2 (Zonen-Detail): jeder Kachel-Link, Breadcrumb/Back.
  - Subzone-Bezug in L1 falls sichtbar: Anzeige, Verlinkung.
- **Dokumentation:** Wie Block 1.

### Block 3: Monitor — Ebene 2 (Zonen-Detail)

- **Route/View:** **`/monitor/:zoneId`** (MonitorView, Ebene 2 = eine Zone ausgewählt).
- **Zu prüfen:**
  - Sektionen-Reihenfolge: Zonen-Header → Sensoren → Aktoren → Zone-Dashboards → Inline-Panels (laut Layout-Auftrag).
  - Überschriften und Zählung: „Sensoren (N)“, „Aktoren (N)“; doppelte Zählung (Sektion vs. Subzone-Zeile) erfassen.
  - Pro Subzone-Zeile: Label (z. B. „Keine Subzone“), Anzahl Sensoren/Aktoren, Klicks zu Detail/Config.
  - Zone-Dashboards und Inline-Panels: Reihenfolge, Links, API-Calls.
  - Alle Buttons/Links der Seite: Navigation, Backend-Calls, Konsolen-/Netzwerkfehler.
- **Dokumentation:** Wie Block 1; bei doppelter Zählung oder falscher Reihenfolge exakte Komponente/Zeile angeben.

### Block 4: Komponenten-Tab — vollständiger Durchklick (KI-Plattform)

- **Route/View:** Komponenten-Tab = **`/sensors`** (Sidebar: „Komponenten“). Eine View: **SensorsView** = flaches **Komponenten-Inventar** (InventoryTable + DeviceDetailPanel im SlideOver). Es gibt keine separaten Sidebar-Tabs „Sensoren“/„Aktoren“; die Route `/actuators` leitet auf `/sensors` um.
- **Inhalt /sensors:**
  - **InventoryTable:** Suche, Filter (Typ, Status, Zone), Spaltenauswahl, Pagination; Zeilenklick öffnet DeviceDetailPanel.
  - **DeviceDetailPanel (SlideOver):** Status, aktueller Wert, Zone, ESP, GPIO; **Typspezifische Metadaten** (SchemaForm); **Verknüpfte Regeln** (LinkedRulesSection); **Zone-Kontext** (ZoneContextEditor, nur bei Zone); Link **„Vollständige Konfiguration“** → führt zu **`/hardware?openSettings={espId}`** (HardwareView öffnet dort SensorConfigPanel/ActuatorConfigPanel).
- **Vollständige Geräte-Einstellungen (Name, Schwellen, Alerts, Runtime, Subzone, Metadaten):** Diese liegen in **HardwareView** bei geöffnetem ESP (SlideOver mit SensorConfigPanel/ActuatorConfigPanel), erreichbar über „Vollständige Konfiguration“ aus dem Komponenten-Tab oder direkt über `/hardware` mit `?openSettings=espId`. Im Trockentest: Nach Prüfung von /sensors (Inventar + DeviceDetailPanel) auch HardwareView mit `openSettings` durchgehen und dort alle Config-Panels (SensorConfigPanel: Basis, Schwellen, AlertConfig, Runtime, Metadaten, Subzone, LinkedRules; ActuatorConfigPanel: analog) testen.
- **Zu prüfen (erschöpfend):**
  - **Navigation:** Einstieg von Sidebar („Komponenten“), Deep-Links `?focus=sensorId` / `?sensor=espId-gpioN`.
  - **Listen/Listenansicht:** Filter (Typ, Status, Zone), Sortierung, Spalten — jede Aktion ausführen, Fehler notieren.
  - **DeviceDetailPanel:** SchemaForm speichern, ZoneContextEditor, LinkedRulesSection, alle drei Links (Vollständige Konfiguration, Live-Daten im Monitor, Zone im Monitor).
  - **HardwareView + openSettings:** SensorConfigPanel/ActuatorConfigPanel: Basis, Subzone, Schwellen, AlertConfig, Runtime/Wartung, Metadaten, LinkedRules; Speichern/Abbrechen, Backend-Response, Toasts.
  - **Subzone-Zuweisung:** In Config-Panels (SubzoneAssignmentSection); Zuweisen/Entfernen, Fehlermeldungen (inkl. Mock).
  - **Links:** Jeden Link zu Monitor/Hardware/Logic; tote oder falsche Routen dokumentieren.
- **Dokumentation:** Jeder Fehler mit Kategorie (Layout/Backend/Navigation/Verknüpfung/Einstellung), exakter Ort (View, Komponente, API-Endpoint), Beschreibung, Priorität.

### Block 5: Hardware-View (3-Level-Zoom)

- **Route/View:** **`/hardware`**, **`/hardware/:zoneId`**, **`/hardware/:zoneId/:espId`** (HardwareView). Query **`?openSettings=espId`** öffnet den ESP-SlideOver mit SensorConfigPanel/ActuatorConfigPanel (siehe Block 4).
- **Zu prüfen:**
  - Level 1: Zonen-Übersicht, Filter, Links zu Level 2.
  - Level 2: Geräte in Zone, Links zu Level 3 (ESP-Detail); Klick auf ESP öffnet Einstellungen (SlideOver).
  - Level 3: ESP-Detail, Sensoren/Aktoren, Config-Panels (SensorConfigPanel, ActuatorConfigPanel), Zone/Subzone-Anzeige.
  - Verknüpfung zu Monitor/Komponenten: Links von Hardware → Monitor/Komponenten und umgekehrt (inkl. `openSettings`-Links aus anderen Views).
- **Dokumentation:** Wie Block 1.

### Block 6: Navigation und Verlinkungen (quer)

- **Zu prüfen:**
  - Sidebar: Jeder Menüpunkt — korrekte Route, keine 404, keine leeren Views.
  - TopBar/Header: Links (z. B. Notifications, User, NOT-AUS), Verhalten.
  - Breadcrumbs: Korrektheit, Zurück-Navigation.
  - Cross-Links: Dashboard ↔ Monitor ↔ Komponenten ↔ Hardware ↔ Logic/System-Monitor; tote oder falsche URLs im Bericht.
- **Dokumentation:** Pro fehlerhafter Verknüpfung: Quelle (Seite, Komponente), erwartetes Ziel, tatsächliches Verhalten.

### Block 7: Backend und Systemkontext (begleitend)

- Während der Blöcke 1–6: Bei jedem 4xx/5xx oder Konsolenfehler mit API-Bezug:
  - Request-URL, Method, ggf. Request-Body notieren.
  - Response-Status und Response-Body (oder Fehlermeldung) notieren.
  - Server-Log prüfen: bei Docker-Stack `docker logs automationone-server 2>&1 | tail -50`; bei Session-Setup primär `logs/current/god_kaiser.log` bzw. Fallback `logs/server/god_kaiser.log` (vgl. LOG_ACCESS_REFERENCE.md). Ggf. Correlation-ID notieren.
- **Schlechte Verknüpfungen im serverzentrischen Systemkontext:** Wenn z. B. Frontend einen anderen Endpoint nutzt als dokumentiert, oder Daten nicht mit Backend-Schema übereinstimmen, oder Links zu nicht existierenden Ressourcen — im Bericht unter „Systemkontext / Verknüpfungen“ aufführen.

---

## Technische Ausführung

### Playwright MCP (obligatorisch)

- **Vor jedem Block:** `browser_navigate` zur jeweiligen Route.
- **Pro Seite:** `browser_snapshot` (Accessibility-Tree) für Element-Referenzen; `browser_click` für alle relevanten Buttons/Links/Tabs.
- **Nach Klicks/Aktionen:** `browser_console_messages` und `browser_network_requests` auswerten; Fehler sofort in die Berichtsliste aufnehmen.
- **Bei Modals/SlideOvers:** Vollständig durchklicken (alle Tabs, alle Einstellungen), dann schließen und nächsten Eintrag öffnen, bis alle durch sind.

### AutoOps und weitere Plugins

- **AutoOps:** Explizit beauftragen (z. B. Health-Check, System-Cleanup, Diagnose). Ergebnisse, die für den Trockentest relevant sind (z. B. fehlende Endpoints, falsche Konfiguration), in den Bericht aufnehmen.
- **Alle anderen verfügbaren Plugins** des Agenten im Testkontext nutzen, wo es die Vollständigkeit des Durchklicks oder die Fehleranalyse unterstützt.

### Mock/Backend

- Wenn für Reproduktion nötig: Mock-ESP (z. B. MOCK_0954B2B1 oder Test-Mock) und MQTT wie in `auftrag-chaos-engineering-mock-volltest.md` nutzen.
- API-Checks (z. B. Auth, `/health`, Zonen, Subzonen, Sensoren, Aktoren) wie in Chaos-Volltest Block B durchführen; Abweichungen (4xx/5xx, Schema) im Bericht vermerken.

---

## Bericht: Format und Ablage

### Dateiname

- `trockentest-bericht-layout-zonen-komponenten-2026-03-03.md` (oder aktuelles Datum)  
- **Ablage:** `.claude/reports/current/` (Projekt-Standard). Nicht `arbeitsbereiche/automation-one/reports/` (existiert in diesem Repo nicht).

### Inhalt (ein Dokument)

1. **Metadaten:** Datum, Agent, Scope (Layout, Zonen, Subzones, Dashboard, Monitor, Komponenten-Tab, Verlinkungen, Systemkontext).
2. **Kurzfassung:** Anzahl Fehler pro Kategorie (Layout, Backend, Navigation, Verlinkung, Einstellung, Sonstiges), Top-3 kritische Punkte.
3. **Fehlerliste (vollständig):**
   - Pro Eintrag: **ID** (z. B. F001, F002), **Kategorie**, **Ort** (View/Route/Komponente/API), **Beschreibung**, **Reproduktion** (optional), **Priorität** (Kritisch/Hoch/Mittel/Niedrig).
4. **Systemkontext / Verknüpfungen:** Alle schlechten oder fehlenden Verknüpfungen (Frontend ↔ Backend, Links zu Ressourcen, Dokumentation vs. Implementierung).
5. **Empfehlungen:** Kurz priorisierte nächste Schritte (Fix-Aufträge, Analyse-Aufträge).

---

## Akzeptanzkriterien

- [ ] Block 1–7 nacheinander abgearbeitet; pro Block „Seite komplett durchgeklickt“, kein Springen.
- [ ] Komponenten-Tab vollständig durchgeklickt: alle Einstellungen (Basis, Schwellen, Metadaten, Runtime/Wartung, Subzone) pro Gerätetyp getestet; alle Fehler erfasst.
- [ ] AutoOps und alle genutzten Plugins im Auftrag verwendet; relevante Befunde im Bericht.
- [ ] Ein einziger Bericht mit allen Fehlern, inkl. Ort und Kategorie; schlechte Verknüpfungen im serverzentrischen Systemkontext aufgeführt.
- [ ] Bericht im vereinbarten Ordner abgelegt und dem Life-Repo (z. B. Verweis in STATUS.md oder kurze Meldung an Robin) bekanntgegeben.

---

## Referenzen

| Dokument | Inhalt |
|----------|--------|
| `auftrag-layout-monitor-seite-ueberschriften-reihenfolge.md` | Layout Monitor (Zählung, Reihenfolge L1/L2) |
| `auftrag-subzonen-mock-geraete-analyse-integration.md` | Subzonen für Mock, Backend/Frontend |
| `auftrag-chaos-engineering-mock-volltest.md` | Playwright MCP, Mock-Setup, API-Tests, Blöcke A–G+ |
| `systemueberblick-fuer-auto-one.md` | 7 Domains, MCP, AutoOps, Stack |
| `auftrag-komponenten-tab-wissensinfrastruktur.md` (in `.claude/reports/current/`) | Komponenten-Tab Vision, 4A.8, Metadaten/Runtime |
| `auftrag-phase4a-notification-stack.md` (in `.claude/reports/current/`) | 4A.8 Component Tab, Runtime, Metadaten |
| `.claude/agents/` (z. B. frontend-debug, server-debug) | Agent-Kontext; kein „automation-experte“ im Repo |
| `.claude/reference/api/REST_ENDPOINTS.md` | REST-API (Zonen, Subzonen, Sensoren, Aktoren, Zone-Context, Schema-Registry, Backups, …) |
| `.claude/reference/api/WEBSOCKET_EVENTS.md` | WebSocket-Events (Echtzeit-Updates) |
| `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md` | Server-/Frontend-/MQTT-Log-Pfade; Docker: `automationone-server` |
