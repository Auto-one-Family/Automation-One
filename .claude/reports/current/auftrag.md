# Auftrag: Dashboard-Umbenennung + Erstanalyse View-Architektur

> **Datum:** 2026-02-26
> **Aktualisiert:** 2026-02-26 (Erstanalyse-Ergebnisse + Vision Block D + Verifikations-Korrekturen)
> **Prioritaet:** P1 (Struktureller Erstschritt)
> **Aufwand:** ~4-6 Stunden (2 Bloecke + Analyse-Ergebnisse)
> **Voraussetzung:** Keine (eigenstaendiger Vorlauf-Auftrag)
> **Agent:** Frontend-Dev Agent (auto-one)
> **Branch:** `fix/sht31-crc-humidity` (Block A umgesetzt auf diesem Branch)
> **Eltern-Auftrag:** `auftrag-view-architektur-dashboard-integration.md`
> **Status Block A:** Umbenennung UMGESETZT — verifiziert: Sidebar.vue:81-82, ViewTabBar.vue:20
> **Status Block B:** Erstanalyse ERLEDIGT — Report unter `.claude/reports/current/erstanalyse-view-architektur-2026-02-26.md`
> **Status Block C:** Korrekturen DOKUMENTIERT — 6 Fehleinschaetzungen aufgedeckt
> **Status Block D:** Vision FREIGEGEBEN — Robins Architektur-Entscheidung

---

## Zweck

Dieser Auftrag ist der **erste kleine Schritt** aus dem grossen View-Architektur-Auftrag. Er trennt zwei Dinge sauber:

1. **Schnelle Fixes:** Umbenennung Sidebar + Tab — sofort umsetzbar, keine Architektur-Aenderung
2. **Erstanalyse:** Tiefgehende Bestandsaufnahme der vorhandenen Komponenten, damit die nachfolgenden Umbau-Schritte auf solidem Fundament stehen

Der Auftrag veraendert **keine Architektur, keine Routing-Struktur, keine Komponenten-Hierarchie**. Er benennt um und analysiert.

---

## Kontext: Warum umbenennen?

Die aktuelle Benennung verwirrt User:

| Element | IST-Zustand | Problem |
|---------|-------------|---------|
| Sidebar-Eintrag | "Hardware" | Klingt nach Geraeteverwaltung. Tatsaechlich ist es der **zentrale Arbeitsbereich** — Zonen, Sensoren, Aktoren, Live-Monitoring, alles. "Hardware" unterschlaegt 80% dessen was dort passiert |
| ViewTabBar Tab 3 | "Dashboard" | Suggeriert eine **fertige Ansicht** (wie bei Grafana, Home Assistant). Ist aber der **Builder** — ein leeres Canvas mit Widget-Library. User suchen ihre gespeicherten Dashboards und finden stattdessen einen Editor |

Die neuen Namen sollen klar kommunizieren was der User dort findet.

---

## Block A: Umbenennung (~1-2h)

### A1: Sidebar — "Hardware" wird "Dashboard"

**Aenderung:** Der Sidebar-Eintrag "Hardware" wird zu **"Dashboard"** umbenannt.

**Begruendung:** Der Bereich IST das Dashboard — die zentrale Schaltzentrale wo der User den Gesamtzustand seines Systems sieht, in Zonen navigiert, Live-Werte beobachtet und Geraete konfiguriert. Das ist exakt was "Dashboard" in der IoT-Welt bedeutet: eine Uebersichtsseite mit Drill-Down.

| Vorbild | Benennung Hauptbereich |
|---------|----------------------|
| Home Assistant | "Dashboard" (fuer die Hauptansicht) |
| ThingsBoard | "Dashboards" (fuer die Geraete-Uebersicht) |
| Grafana | "Dashboards" (fuer alle Ansichten) |
| AWS IoT SiteWise | "Dashboard" (fuer Asset-Monitoring) |

**Dateien die sich geaendert haben:**
- `shared/design/layout/Sidebar.vue` (Zeilen 76-82) — Label "Hardware" → "Dashboard", Icon → `LayoutDashboard`
- Route bleibt `/hardware` (vorerst — Route-Umbenennung kommt in spaeterem Auftrag)
- Sidebar-Aktivierungslogik: aktiv fuer `/hardware`, `/monitor`, `/custom-dashboard` (Sidebar.vue:76-77)

> **KORREKTUR (Verifikation):** Dateiname war faelschlich als `AppSidebar.vue` angegeben. Tatsaechlich: `shared/design/layout/Sidebar.vue`.

### A2: ViewTabBar — "Dashboard" wird "Dashboard-Editor"

**Aenderung:** Der Tab im ViewTabBar der aktuell "Dashboard" heisst wird zu **"Dashboard-Editor"** umbenannt.

**Begruendung:** "Editor" ist international verstaendlich, professionell und beschreibt praezise was der Tab bietet: einen Bearbeitungsmodus zum Erstellen und Anpassen eigener Dashboards. Es setzt sich klar ab vom passiven "Dashboard anschauen".

| Alternative | Bewertung | Entscheidung |
|-------------|-----------|-------------|
| Dashboard-Editor | Klar, professionell, international | **GEWAEHLT** |
| Dashboard-Designer | Zu visuell/kreativ fuer IoT-Kontext | Verworfen |
| Eigene Ansichten | Trifft nicht den Kern (auch Gallery, nicht nur Editor) | Verworfen |
| Dashboard-Konfigurator | Zu lang, zu technisch | Verworfen |
| Ansichten-Editor | Zu abstrakt — was sind "Ansichten"? | Verworfen |

**Dateien die sich aendern:**
- `ViewTabBar.vue` — Tab-Label "Dashboard" → "Dashboard-Editor"
- Falls ein Tooltip existiert: "Dashboard erstellen und anpassen" als Tooltip-Text

### A3: Commit + Verifikation

```
feat(ui): rename sidebar "Hardware" to "Dashboard", tab "Dashboard" to "Dashboard-Editor"
```

**Verifikation:**
- [ ] Sidebar zeigt "Dashboard" statt "Hardware"
- [ ] Tab zeigt "Dashboard-Editor" statt "Dashboard"
- [ ] Alle Navigation funktioniert wie zuvor (keine Route-Aenderung)
- [ ] Kein visueller Bruch (Spacing, Icon-Alignment pruefen)
- [ ] `npm run build` erfolgreich
- [ ] Bestehende Tests gruen

---

## Block B: Erstanalyse View-Architektur (~3-4h)

### B1: Aufgabe

Der Agent fuehrt eine **tiefgehende Bestandsaufnahme** der gesamten View-Architektur durch und erstellt einen strukturierten Analyse-Report. Ziel ist es, den IST-Zustand so klar zu dokumentieren, dass die nachfolgenden Umbau-Schritte (Monitor-Integration, Dashboard-Gallery, Ebenen-Vereinheitlichung) auf einem soliden, verifizierten Fundament stehen.

### B2: Analyse-Bereiche

Der Report muss folgende Bereiche abdecken:

#### B2.1: Ebenen-System — IST-Zustand

Die Drei-Ebenen-Navigation (Level 1 → Level 2 → Level 3) ist das Rueckgrat der Anwendung. Fuer jeden Level dokumentieren:

| Frage | Details |
|-------|---------|
| Welche Komponente rendert den Level? | Vue-Komponente, Zeilenanzahl, Props |
| Wie wird zwischen Leveln navigiert? | URL-Schema, Query-Parameter, Composable |
| Welche Daten werden auf dem Level gezeigt? | Stores, API-Calls, WebSocket-Events |
| Welche Aktionen sind auf dem Level moeglich? | CRUD, Config, Navigation |
| Gibt es Ueberschneidungen zwischen Leveln? | Redundante Daten/Komponenten |

Besonderes Augenmerk auf:
- **`useZoomNavigation.ts`** (354 Zeilen): Wie genau funktioniert die Level-Transition? URL-Sync? Browser-Back?
- **Query-Parameter-Architektur:** `?zone=X&device=Y` vs. Route-Parameter `/:zoneId/:espId` — was wird tatsaechlich verwendet?
- **State-Persistenz:** Was passiert beim Browser-Refresh auf Level 2/3? Geht der Kontext verloren?

#### B2.2: Monitor-Integration — Bestandsaufnahme

Drei Komponenten decken "Monitoring" ab — aber mit unterschiedlichen Zielen:

| Komponente | Zeilen | Was sie zeigt | Wo sie eingebunden ist |
|-----------|--------|---------------|----------------------|
| MonitorView.vue | 985 | Sensoren nach Subzone gruppiert, Live-Werte, eigenes 2-Level-System | ViewTabBar Tab "Monitor" |
| ZoneMonitorView.vue | 633 | Sensoren + Aktoren nach Subzone, Sparklines | **NIRGENDS (Dead Code, 0 Imports)** |
| SensorsView.vue | **1638** | Sensor-CRUD + Live-Werte + Sparklines + Kalibrierung + Emergency-Stop | Sidebar "Komponenten" |

> **KORREKTUR (Verifikation):** SensorsView.vue ist 1638 Zeilen (nicht ~670 wie urspruenglich geschaetzt). Das ist 2.4x des angegebenen Werts und bedeutet: die Komponente hat deutlich mehr Monitoring-Logik eingebaut als angenommen. Die 30/70-Aufteilung (Monitoring vs. CRUD) aus B2.3 der Erstanalyse muss ggf. revidiert werden.

**Analyse-Fragen:**
- Welche Logik teilen MonitorView und ZoneMonitorView? Wie viel Ueberlappung in Prozent?
- Nutzt ZoneMonitorView.vue die gleichen Stores/Composables wie MonitorView?
- Welche Teile von SensorsView.vue sind reine Monitoring-Logik (Read-Only) und welche sind Management-Logik (CRUD)?
- Kann die Monitor-Perspektive als Composable (`useMonitorPerspective.ts`) aus ZoneMonitorView extrahiert werden, ohne ZoneMonitorView selbst zu brechen?

#### B2.3: Dashboard-Builder — IST-Zustand

Die CustomDashboardView.vue (**790 Zeilen**, nicht 620 wie in Dashboard_analyse.md) ist der einzige Dashboard-Builder. Analyse:

| Frage | Details |
|-------|---------|
| Wie werden Dashboards gespeichert? | localStorage? API? Store? |
| Welches Datenmodell hat ein Dashboard? | Widgets, Layout, Zeitbereich, Name, ID |
| Welche Widgets gibt es und wie werden sie registriert? | Widget-Registry, Konfigurationsschema |
| Gibt es eine Unterscheidung zwischen Edit-Mode und View-Mode? | Aktuell: Nein. Immer Edit |
| Wie interagiert GridStack.js mit Vue-Reaktivitaet? | Bekannte Probleme? Performance? |
| Was passiert bei 20+ Widgets? | Performance-Ceiling? Lazy Loading? |

**Dashboard-bezogene Neben-Komponenten auflisten:**
- SensorSidebar.vue, ActuatorSidebar.vue, ComponentSidebar.vue — Rolle und Redundanzen
- LevelNavigation.vue — wird sie noch verwendet?
- Widget-Komponenten (HistoricalChartWidget, ESPHealthWidget, etc.) — vollstaendige Liste mit Datenquellen

#### B2.4: Routing + Navigation — Vollstaendige Karte

Eine vollstaendige Route-Map erstellen:

```
Route → View-Komponente → Einbindung (Sidebar/Tab/Redirect) → Status (aktiv/deprecated/geplant)
```

Dabei alle Redirects, Guards und Lazy-Loading-Konfigurationen erfassen.

**Spezifische Fragen:**
- Welche Routes haben `beforeEnter` Guards? Auth-basiert?
- Gibt es Wildcard-/Catch-All-Routes fuer 404?
- Wie ist Lazy Loading konfiguriert? Welche Chunks entstehen beim Build?

#### B2.5: Redundanz-Inventar — Verifiziert

Das bestehende Redundanz-Inventar aus `auftrag-view-architektur-dashboard-integration.md` verifizieren und erweitern:

| Bekannte Redundanz | Vom Agent zu pruefen |
|-------------------|---------------------|
| SensorSidebar ↔ ComponentSidebar | Tatsaechlich redundant? Oder unterschiedliche Features? |
| ZoomBreadcrumb ↔ TopBar Breadcrumb | Wird ZoomBreadcrumb irgendwo importiert? |
| LevelNavigation ↔ ViewTabBar | Ist LevelNavigation noch aktiv? |
| ZoneDetailView ↔ ZoneMonitorView | Welche wird tatsaechlich gerendert auf Level 2? |
| DashboardView.vue (/) ↔ HardwareView (/hardware) | Ist DashboardView noch aktiv oder nur Redirect-Ziel? |

**Neue Redundanzen suchen:** Insbesondere in Stores — gibt es doppelte API-Calls fuer dieselben Daten?

#### B2.6: Komponentenabhaengigkeits-Graph

Fuer die Kern-Views (HardwareView, MonitorView, CustomDashboardView, SensorsView) einen Import-Baum erstellen:

```
HardwareView.vue
├── ZonePlate.vue
│   ├── DeviceMiniCard.vue
│   └── StatusIndicator.vue
├── ZoneMonitorView.vue (oder ZoneDetailView.vue?)
│   ├── SensorCard.vue
│   └── SparklineChart.vue
├── ESPOrbitalLayout.vue (Level 3)
│   ├── SensorConfigPanel.vue
│   └── ActuatorConfigPanel.vue
└── useZoomNavigation.ts
```

Das hilft zu verstehen, welche Komponenten bei einer Umstrukturierung betroffen sind.

### B3: Vorschlaege fuer naechste Schritte

Am Ende des Reports soll der Agent **konkrete, priorisierte Vorschlaege** machen:

1. **Tab-Benennung unter "Dashboard":** Wie sollten die Tabs heissen, wenn der Sidebar-Eintrag "Dashboard" ist? Vorschlaege mit Begruendung. Moegliche Richtungen:
   - [Uebersicht] [Monitor] [Editor] — kurz und klar
   - [Hardware] [Monitor] [Editor] — behalt "Hardware" als Sub-Konzept
   - [System] [Live] [Eigene] — andere Perspektive
   - Eigene Vorschlaege des Agents basierend auf der Analyse

2. **Monitor-Integration:** Konkreter Vorschlag wie MonitorView am besten in die Ebenen-Struktur integriert wird. Optionen bewerten:
   - Als Query-Parameter `?view=monitor` auf Level 1
   - Als eigener Tab der bestehen bleibt
   - Als Toggle innerhalb von Level 1
   - Andere Moeglichkeit

3. **Dashboard-Gallery:** Wo und wie sollten gespeicherte User-Dashboards angezeigt werden? Passt es als eigener Tab? Als Sub-Route? Als Gallery auf Level 1?

4. **Quick-Wins:** Welche Redundanzen oder Inkonsistenzen koennen mit minimalem Aufwand (<30min) behoben werden?

### B4: Report-Format

Der Report wird abgelegt unter:

```
.claude/reports/current/erstanalyse-view-architektur-YYYY-MM-DD.md
```

**Struktur des Reports:**
```markdown
# Erstanalyse: View-Architektur AutomationOne Frontend

## Executive Summary (max 10 Zeilen)
## 1. Ebenen-System (B2.1)
## 2. Monitor-Komponenten (B2.2)
## 3. Dashboard-Builder (B2.3)
## 4. Routing + Navigation (B2.4)
## 5. Redundanz-Inventar (B2.5)
## 6. Komponentenabhaengigkeits-Graph (B2.6)
## 7. Vorschlaege (B3)
## Anhang: Rohdaten
```

Jeder Abschnitt mit Tabellen, Code-Referenzen (Datei:Zeilennummer) und konkreten Zahlen. Keine vagen Aussagen — jede Behauptung mit Quellenangabe aus dem Code.

---

## Block C: Erkenntnisse aus Erstanalyse — Korrekturen am grossen Auftrag

> **Hinzugefuegt:** 2026-02-26 nach Fertigstellung der Erstanalyse

Die Erstanalyse hat **5 kritische Fehleinschaetzungen** im grossen Auftrag (`auftrag-view-architektur-dashboard-integration.md`) aufgedeckt. Diese muessen korrigiert werden bevor die Implementierung beginnt.

### C1: useZoomNavigation.ts existiert NICHT

**Auftrag-Annahme:** "useZoomNavigation.ts (354 Zeilen)" wird als bestehend referenziert.
**Realitaet:** Die Datei existiert nicht. Die Zoom-Navigation ist direkt in HardwareView.vue implementiert:

```typescript
// HardwareView.vue:61-65
const currentLevel = computed<1 | 2 | 3>(() => {
  if (route.params.espId) return 3
  if (route.params.zoneId) return 2
  return 1
})
```

**Korrektur fuer grossen Auftrag:** Alle Referenzen auf `useZoomNavigation.ts` streichen. Die Navigation ist route-basiert (`/hardware/:zoneId/:espId`) und funktioniert korrekt inkl. Browser-Refresh. Kein Composable noetig.

### C2: ZoneMonitorView.vue ist Dead Code (0 Imports)

**Auftrag-Annahme (Block A1):** "ZoneMonitorView.vue als Basis fuer useMonitorPerspective.ts nutzen — deckt ~80% der Logik ab."
**Realitaet:** ZoneMonitorView.vue (633 Zeilen) wird **nirgends importiert**. Es ist Dead Code — eine alternative Implementierung die nie integriert wurde.

**Korrektur fuer grossen Auftrag:** Block A1 komplett umschreiben. Zwei Optionen:
1. MonitorView.vue (985 Zeilen, AKTIV mit eigenem 2-Level-System) als Basis nehmen
2. useMonitorPerspective.ts neu schreiben basierend auf MonitorView-Logik

ZoneMonitorView.vue → Dead-Code-Cleanup (Quick-Win, siehe C5).

### C3: MonitorView hat ein eigenes 2-Level-System

**Auftrag-Annahme:** Monitor ist eine "flache Perspektive" die als Query-Parameter `?view=monitor` in Level 1 integriert werden kann.
**Realitaet:** MonitorView hat **eigene Route-Parameter** (`/monitor`, `/monitor/:zoneId`) — ein vollstaendiges 2-Level-System mit Zone-Tiles auf Level 1 und Sensor/Actuator-Detail auf Level 2.

**Korrektur fuer grossen Auftrag:** Die Monitor-Integration ist komplexer als geplant. Drei Optionen:

| Option | Aufwand | Bewertung |
|--------|---------|-----------|
| **A: Monitor als Tab beibehalten** | Minimal | Empfohlen von Erstanalyse. Klare Trennung: Hardware = Topologie, Monitor = Daten. Eigenes Level-System bleibt intakt |
| B: Query-Parameter `?view=monitor` | Hoch (~6h) | Zwei 2-Level-Systeme in einer View verschmelzen — State-Management-Alptraum |
| C: Monitor-Level-2 in Hardware-Level-2 als Toggle | Mittel (~4h) | Machbar, aber erfordert doppelte Level-2-Rendering-Logik |

**Empfehlung:** Option A — Monitor als eigenen Tab beibehalten, nur umbenennen. Das widerspricht dem grossen Auftrag, aber die Erstanalyse zeigt dass die Systeme zu verschieden sind fuer eine saubere Verschmelzung.

### C4: Tab-Benennung — Neuer Vorschlag

**Auftrag-Annahme:** Tabs werden [Hardware] [Dashboards] (2 Tabs, Monitor eliminiert).
**Erstanalyse-Empfehlung:** **[Uebersicht] [Monitor] [Editor]** (3 Tabs bleiben, alle umbenannt).

| Tab | Vorher | Nachher | Begruendung |
|-----|--------|---------|-------------|
| 1 | Hardware | **Uebersicht** | Level 1 zeigt alle Zonen als Tiles — das IST eine Uebersicht |
| 2 | Monitor | **Monitor** | Name passt bereits. Operationales Monitoring mit Live-Daten |
| 3 | Dashboard | **Editor** | Dashboard-Builder. Im Kontext des Sidebar-Eintrags "Dashboard" ist "Editor" eindeutig |

**Entscheidung noetig von Robin:** Welche Tab-Benennung? [Uebersicht] [Monitor] [Editor] oder eine andere Variante?

### C5: ~1969 Zeilen Dead Code — Cleanup VOR Architektur-Umbau

**Auftrag-Annahme:** "Redundanzen werden in diesem Auftrag NICHT behoben — nur dokumentiert."
**Erstanalyse-Ergebnis:** 5 Komponenten mit **exakt 0 Imports** — sicherer Loeschkandidat:

| Komponente | Zeilen | Risiko |
|-----------|--------|--------|
| SensorSidebar.vue | 573 | Null (ersetzt durch ComponentSidebar) |
| ActuatorSidebar.vue | 518 | Null (ersetzt durch ComponentSidebar) |
| ZoneMonitorView.vue | 633 | Null (nie integriert) |
| ZoomBreadcrumb.vue | 121 | Null (TopBar hat Breadcrumbs) |
| LevelNavigation.vue | 124 | Null (ViewTabBar hat Navigation) |
| LevelNavigation.test.ts | 76 | Null (Test fuer Dead-Code-Komponente) |

> **KORREKTUR (Verifikation):** LevelNavigation.vue hat eine zugehoerige Testdatei (`tests/unit/components/LevelNavigation.test.ts`, 76 Zeilen) die mitgeloescht werden muss. Dead-Code-Total: **2045 Zeilen** (nicht 1969).

**Empfehlung:** Dead-Code-Cleanup als **ersten Commit** im naechsten Auftrag, BEVOR Architektur-Aenderungen beginnen. ~45 Minuten Aufwand, -2045 Zeilen, null Risiko.

### C6: Dashboard-Gallery — Pragmatischer Ansatz

**Auftrag-Annahme (Block B):** DashboardGalleryView.vue als neue View unter `/dashboards`.
**Erstanalyse-Empfehlung:** Gallery als **Default-Ansicht innerhalb des Editor-Tabs** — kein Route-Umbau noetig.

CustomDashboardView.vue bekommt einen `showGallery`-State. Bei Entry: Gallery anzeigen. Bei Dashboard-Klick: Editor oeffnen. Zurueck-Button fuer Gallery.

**Vorteil:** Kein neuer View, kein Route-Umbau, kein neuer Lazy-Chunk. ~2h statt ~4h Aufwand.

---

## Block D: Konsolidierte View-Architektur — Robins Vision (2026-02-26)

> **Hinzugefuegt:** 2026-02-26 — Robins Entscheidung zur Architektur-Richtung.
> Dieses Kapitel ersetzt die Empfehlungen aus Block C3/C4 und wird zur **verbindlichen Grundlage** fuer die Ueberarbeitung des grossen Auftrags.

### D1: Grundprinzip — Drei klar getrennte Perspektiven

```
Sidebar: "Dashboard"
├── Tab [Uebersicht]  → WO sind meine Geraete?    (Topologie: Zonen → ESPs → Orbital)
├── Tab [Monitor]      → WAS zeigen meine Daten?   (Sensoren flat + User-Dashboards)
└── Tab [Editor]       → WIE will ich es sehen?    (Dashboard-Builder)
```

Jeder Tab hat einen **eigenen Zweck und eine eigene Zielgruppe**. Kein Tab uebernimmt Aufgaben eines anderen. Aber: User-Dashboards bilden eine **Bruecke zwischen Monitor und Editor** — gebaut im Editor, angezeigt im Monitor.

### D2: Tab [Uebersicht] — Topologie-Ansicht (EINE Ebene ueber Orbital)

**Kernentscheidung:** Level 1 (Zone-Tiles) und Level 2 (Zone-Detail mit ESP-Liste) werden zu **einer einzigen Ebene** zusammengefuehrt. Es gibt nur noch **zwei Navigationsebenen** statt drei:

```
VORHER (3 Ebenen):
  Level 1: Zone-Tiles (ZonePlate.vue)
  Level 2: Zone-Detail → ESP-Liste (ZoneDetailView.vue)       ← ENTFAELLT als eigene Ebene
  Level 3: ESP-Detail → Orbital-Layout (ESPOrbitalLayout.vue)

NACHHER (2 Ebenen):
  Ebene 1: Zonen mit ESPs direkt sichtbar (zusammengefuehrt)
  Ebene 2: Orbital-Layout (UNVERAENDERT)
```

**Was Ebene 1 zeigt:**

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard > Uebersicht                                     │
│                                                              │
│  ┌──── Zone A (Gewaechshaus) ──── 4 ESPs, 3 Online ─────┐ │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │ │
│  │ │ESP_4722  │ │ESP_8831  │ │ESP_1290  │ │ESP_0045  │  │ │
│  │ │● Online  │ │● Online  │ │● Online  │ │○ Offline │  │ │
│  │ │3 Sens.   │ │2 Sens.   │ │1 Akt.    │ │—         │  │ │
│  │ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──── Zone B (Aussenbereich) ──── 2 ESPs, 2 Online ────┐ │
│  │ ┌──────────┐ ┌──────────┐                              │ │
│  │ │ESP_7744  │ │ESP_9911  │                              │ │
│  │ │● Online  │ │● Online  │                              │ │
│  │ │2 Sens.   │ │1 Sens.   │                              │ │
│  │ └──────────┘ └──────────┘                              │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                              │
│  ── Nicht zugewiesen ──────────────────────────────────────  │
│  ESP_NEW_01 (Pending)                                        │
└─────────────────────────────────────────────────────────────┘
```

- Zonen als **aufklappbare Sektionen** (nicht als Kacheln die man anklickt um eine neue Seite zu sehen)
- ESP-MiniCards sind **direkt in der Zone sichtbar** — kein Zwischenklick
- Klick auf ESP → **Orbital-Layout oeffnet sich** (Ebene 2 = Level 3 von heute, UNVERAENDERT)
- Zonen koennen zugeklappt werden (Accordion) fuer grosse Installationen
- Aggregierte KPIs pro Zone (X von Y online, Warnungen)

**Was sich NICHT aendert:**
- ESPOrbitalLayout.vue (655 Zeilen) bleibt komplett unberuehrt
- SensorConfigPanel, ActuatorConfigPanel bleiben wie sie sind
- Die gesamte Sensor/Aktor-Konfiguration auf Orbital-Ebene bleibt identisch

**Technische Umsetzung:**
- HardwareView.vue verliert Level 2 (`/hardware/:zoneId`) als eigene Ansicht
- Level 1 rendert Zonen mit eingebetteten ESP-Cards (bisher ZonePlate → Klick → ZoneDetailView)
- ZoneDetailView.vue (347 Z.) wird in ZonePlate integriert oder als expandable Section umgebaut
- Route-Struktur: `/hardware` (Ebene 1) → `/hardware/:zoneId/:espId` (Ebene 2 = Orbital)
- Optional: `/hardware/:zoneId` als Anker um eine Zone aufgeklappt zu scrollen, aber KEINE eigene Ansicht

### D3: Tab [Monitor] — Sensor-zentrische Daten-Ansicht

**Kernentscheidung:** Alle Sensoren sind **sofort sichtbar** — kein "erst Zone auswaehlen". Gruppierung nach Zone/Subzone, aber alles auf einer Seite.

**Ebene 1 — Sensor-Flat-View:**

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard > Monitor                                         │
│                                                              │
│  ── Zone A > Gewaechshaus > Hauptraum ─────────────────── │
│  ┌──────────────────┐ ┌──────────────────┐                  │
│  │ Temperatur       │ │ Luftfeuchtigkeit │                  │
│  │ SHT31 (ESP_4722) │ │ SHT31 (ESP_4722) │                  │
│  │ 23.5°C  ● OK     │ │ 65.2%   ● OK     │                  │
│  │ ▁▂▃▄▅▆▇ (15min)  │ │ ▇▆▅▄▃▂▁ (15min)  │                  │
│  └──────────────────┘ └──────────────────┘                  │
│                                                              │
│  ── Zone A > Gewaechshaus > Bewaesserung ─────────────── │
│  ┌──────────────────┐ ┌──────────────────┐                  │
│  │ Bodenfeuchte B3  │ │ pH Naehrloesung  │                  │
│  │ Analog (ESP_8831)│ │ ADC (ESP_8831)   │                  │
│  │ 45%     ● OK     │ │ 6.2     ⚠ WARN   │                  │
│  │ ▃▃▃▂▂▁▁ (15min)  │ │ ▅▅▆▇▇▇▇ (15min)  │                  │
│  └──────────────────┘ └──────────────────┘                  │
│                                                              │
│  ── Zone B > Aussenbereich ──────────────────────────────  │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

- Sensoren als **Cards**, gruppiert nach Zone → Subzone (Sections, alle defaultmaessig offen)
- Jede Card: Sensorname, Typ, ESP-Zuordnung, aktueller Wert, Quality-Badge, Mini-Sparkline
- **Kein Zone-Klick noetig** — der User sieht sofort alle Sensoren seines Systems
- Subzone-Sektionen klappbar fuer grosse Installationen

**Ebene 2 — Sensor-Detail (Klick auf Sensor-Card):**

Klick auf eine Sensor-Card oeffnet ein **Diagramm-Panel** (SlideOver oder Expand):
- Zeitreihen-Chart (1h / 6h / 24h / 7d / 30d / Custom)
- Schwellwerte als Referenzlinien
- Quality-Verlauf
- Link zum Orbital-Layout ("ESP oeffnen") fuer Konfiguration

**Ebene 3 — User-Dashboards:**

In den "tieferen Ebenen" des Monitor-Tabs sind die **vom User erstellten Dashboards** erreichbar:

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard > Monitor                                         │
│                                                              │
│  [Alle Sensoren]  [Meine Ansichten ▾]                       │
│                    ├── Gewaechshaus-Klima (Dashboard)        │
│                    ├── Bewaesserungs-Check (Dashboard)       │
│                    └── Tages-Report (Dashboard)              │
└─────────────────────────────────────────────────────────────┘
```

Der User kann zwischen der Standard-Sensor-Ansicht und seinen eigenen Dashboards umschalten. Dafuer gibt es zwei Mechanismen:

**Mechanismus 1 — Dashboard-Dropdown "Meine Ansichten":**
- Neben dem Tab-Titel eine Auswahl der gespeicherten Dashboards
- Klick auf ein Dashboard → die Sensor-Flat-View wird durch das Dashboard ersetzt (gleicher Tab, anderer Inhalt)
- "Alle Sensoren" bringt zurueck zur Standard-Ansicht

**Mechanismus 2 — Dashboard-Platzierung (vom Editor aus):**
- Im Editor kann der User beim Speichern eines Dashboards festlegen: **"Anzeigen unter: Monitor > [Dropdown: Meine Ansichten]"**
- Optional: Dashboard einer bestimmten Zone zuordnen → erscheint dann als Sub-Ansicht dieser Zone
- Optional: Dashboard als **Standard-Startansicht** des Monitor-Tabs festlegen (statt Sensor-Flat-View)

**Mechanismus 3 — Inline-Bearbeitung:**
- Wenn ein User-Dashboard im Monitor-Tab angezeigt wird, erscheint ein dezenter "Bearbeiten"-Button (Stift-Icon)
- Klick → Wechsel in den Editor-Tab mit diesem Dashboard geoeffnet
- Alternativ: Inline-Edit-Mode direkt im Monitor-Tab (GridStack `static: false`) — das ist die Luxus-Variante fuer spaeter

### D4: Tab [Editor] — Dashboard-Builder

**Keine Aenderung am Builder selbst.** Der Editor bleibt wie er ist (CustomDashboardView.vue, GridStack.js, 8 Widget-Typen).

**Neue Ergaenzungen:**

1. **Gallery als Start-Screen:** Beim Oeffnen des Editor-Tabs sieht der User seine gespeicherten Dashboards als Kacheln. "Neues Dashboard" Button prominent. Klick auf Kachel → Editor oeffnet sich mit diesem Dashboard.

2. **Zielort-Auswahl beim Speichern:** Nach dem Speichern (oder im Dashboard-Settings-Dialog):
   ```
   Dieses Dashboard anzeigen unter:
   ○ Nur hier (Editor-Gallery)
   ○ Monitor > Meine Ansichten
   ○ Monitor > Meine Ansichten + Als Startansicht
   ```
   Das steuert, ob und wo das Dashboard im Monitor-Tab auftaucht.

3. **View/Edit-Mode-Toggle:** Wenn ein Dashboard aus dem Monitor-Tab geoeffnet wird, startet es im View-Mode (GridStack `static: true`). Bearbeiten-Button wechselt zu Edit-Mode.

### D5: Orbital-Layout — UNBERUEHRT

Das Orbital-Layout (ESPOrbitalLayout.vue, 655 Zeilen) ist die **Konfigurationsebene** fuer einzelne ESPs. Es wird in dieser Architektur-Umstellung **nicht angefasst**:

- Erreichbar aus: Tab [Uebersicht] → Klick auf ESP-Card
- Inhalt: Sensoren/Aktoren als Satelliten um ESP-Zentrum
- Aktionen: SensorConfigPanel, ActuatorConfigPanel, AddSensor, AddActuator
- Zurueck-Navigation: Breadcrumb oder Escape-Key → zurueck zu Ebene 1

### D6: Navigationsfluss — Gesamtbild

```
                    ┌─────────────────────────────┐
                    │     Sidebar: "Dashboard"     │
                    └──────────┬──────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                   │
     [Uebersicht]         [Monitor]           [Editor]
            │                  │                   │
    Zonen + ESPs flat    Sensoren flat        Gallery
    (Accordion-Sections) (Zone→Subzone Cards) (Dashboard-Kacheln)
            │                  │                   │
    Klick ESP            Klick Sensor         Klick Dashboard
            │                  │                   │
    Orbital-Layout       Diagramm-Panel       GridStack-Builder
    (UNVERAENDERT)       (SlideOver/Expand)   (Widget-Editor)
                               │                   │
                        "Meine Ansichten"      Zielort-Auswahl
                        (User-Dashboards       (Wo anzeigen?)
                         eingebettet)
                               │                   │
                               └───── Bruecke ─────┘
                         Dashboard gebaut im Editor,
                         angezeigt im Monitor
```

### D7: Klick-Pfade — Vorher/Nachher

| Aktion | Vorher (3-Level) | Nachher (2-Level + flat Monitor) |
|--------|-----------------|-----------------------------------|
| Gesamtstatus aller Zonen | Level 1 (Zone-Tiles) — 0 Klicks | Ebene 1 (Zonen mit ESPs) — 0 Klicks |
| ESP finden | Level 1 → Level 2 — 1 Klick | Ebene 1 (schon sichtbar) — 0 Klicks |
| ESP konfigurieren | Level 1 → Level 2 → Level 3 — 2 Klicks | Ebene 1 → Orbital — 1 Klick |
| Sensor-Wert ablesen | Tab Monitor → Zone klicken — 1 Klick | Tab Monitor (sofort sichtbar) — 0 Klicks |
| Sensor-Chart oeffnen | Tab Monitor → Zone → Sensor — 2 Klicks | Tab Monitor → Sensor — 1 Klick |
| User-Dashboard anzeigen | Nicht moeglich (kein Viewer) | Tab Monitor → Meine Ansichten → Dashboard — 2 Klicks |
| Dashboard bearbeiten | Tab Dashboard (immer Edit) — 0 Klicks | Tab Editor → Dashboard waehlen — 1 Klick |

### D8: Praezise Abgrenzung — Was aendert sich, was nicht

| Komponente | Aendert sich? | Details |
|-----------|---------------|---------|
| ESPOrbitalLayout.vue | **NEIN** | Komplett unveraendert. Ebene 2 = altes Level 3 |
| SensorConfigPanel.vue | **NEIN** | Oeffnet sich weiterhin im Orbital-Layout |
| ActuatorConfigPanel.vue | **NEIN** | Oeffnet sich weiterhin im Orbital-Layout |
| HardwareView.vue | **JA** | Level 1+2 zusammenfuehren zu einer Ebene. ZoneDetailView wird in ZonePlate eingebettet |
| MonitorView.vue | **JA** | 2-Level-System wird zu Flat-View umgebaut. Zone-Klick entfaellt. Sensor-Cards direkt sichtbar |
| CustomDashboardView.vue | **JA** | Gallery-Start-Screen + Zielort-Auswahl + View/Edit-Toggle |
| ViewTabBar.vue | **JA** | Labels: [Uebersicht] [Monitor] [Editor] |
| Router | **JA** | `/hardware/:zoneId` entfaellt als eigene Ansicht. `/monitor/:zoneId` entfaellt |
| SensorsView.vue (/sensors) | **NEIN** | Bleibt als dedizierter CRUD-Management-View |
| SensorHistoryView.vue | **NEIN** | Bleibt als dedizierter Zeitreihen-Analyse-View |
| SystemMonitorView.vue | **NEIN** | Bleibt als Admin-System-Monitoring |

---

## Empfohlene Reihenfolge — Naechste Schritte

Basierend auf Block C (Korrekturen) und Block D (Vision):

| Schritt | Was | Aufwand | Abhaengigkeit |
|---------|-----|---------|---------------|
| **1** | Dead-Code-Cleanup (6 Dateien, **-2045 Zeilen**) | ~45 Min | Keine |
| **2** | Tab-Umbenennung [Uebersicht] [Monitor] [Editor] (ViewTabBar.vue:18-20) | ~30 Min | Keine (Robin hat entschieden) |
| **3** | Uebersicht: Level 1+2 zusammenfuehren (D2) — HardwareView 689 Z. + ZoneDetailView 347 Z. | ~4-6h | Schritt 1 |
| **4** | Monitor: Flat-View umbauen (D3 Ebene 1+2) — MonitorView 985 Z. umbauen | ~3-4h | Schritt 1 |
| **5** | Editor: Gallery-Start-Screen + Zielort-Auswahl (D4) — CustomDashboardView **790 Z.** (nicht 620!) | ~4-5h | Schritt 1 |
| **6** | Monitor ↔ Editor Bruecke: Dashboard-Einbettung (D3 Ebene 3) | ~3-4h | Schritt 4 + 5 |
| **7** | Grossen Auftrag mit D-Vision komplett ueberarbeiten | ~2h | Alle Erkenntnisse |

> **KORREKTUR (Verifikation):** Schritt 5 Aufwand nach oben korrigiert (~4-5h statt ~3-4h) weil CustomDashboardView.vue 790 Zeilen hat (27% groesser als angenommen).

**Geschaetzter Gesamtaufwand fuer D2-D6:** ~15-20h (leicht hoeher als urspruenglich geschaetzt durch korrigierte Zeilenzahlen)

---

## Abgrenzung: Was dieser Auftrag NICHT tut

| Nicht in diesem Auftrag | Kommt in welchem Auftrag |
|--------------------------|--------------------------|
| Die eigentliche Implementierung (D2-D6) | Ueberarbeiteter grosser Auftrag oder neue Teilauftraege |
| CSS/Styling-Aenderungen | `auftrag-hardware-tab-css-settings-ux.md` |
| Orbital-Layout aendern | Nicht geplant — bleibt unveraendert |
| Backend-Endpoints fuer Dashboard-Persistenz | `auftrag-dashboard-persistenz.md` |
| DnD-Konsolidierung | `auftrag-dnd-konsolidierung-interaktion.md` |

---

## Abhaengigkeiten

| Auftrag | Beziehung | Datei existiert? |
|---------|-----------|-----------------|
| `auftrag-view-architektur-dashboard-integration.md` | **DIESER AUFTRAG ERSETZT die Architektur-Richtung** — grosser Auftrag muss nach Block D ueberarbeitet werden | Ja |
| `auftrag-hardware-tab-css-settings-ux.md` | **KEINE ABHAENGIGKEIT** — Umbenennung und Analyse sind unabhaengig von CSS-Fixes | **Noch nicht erstellt** |
| `auftrag-orbital-split.md` | **KEINE ABHAENGIGKEIT** — Orbital-Split ist orthogonal, kann parallel laufen | **Noch nicht erstellt** |
| `auftrag-dashboard-persistenz.md` | **SYNERGIE** — Backend-Endpoint wird fuer Dashboard-Platzierung (D3/D4) benoetigt, localStorage als Interim | **Noch nicht erstellt** |

---

## Zusammenfassung

| Was | Ergebnis | Status |
|-----|----------|--------|
| Block A: Umbenennung | Sidebar "Dashboard", Tab "Dashboard-Editor" | **ERLEDIGT** |
| Block B: Erstanalyse | Report mit 6 Analyse-Bereichen + 4 Vorschlaegen | **ERLEDIGT** |
| Block C: Korrekturen | 6 kritische Korrekturen am grossen Auftrag | **DOKUMENTIERT** |
| Block D: Vision | Konsolidierte Architektur: 2 Ebenen, flat Monitor, Dashboard-Bruecke | **FREIGEGEBEN** |
| Naechster Schritt | Dead-Code-Cleanup → Tab-Umbenennung → Implementierung nach D2-D6 |
