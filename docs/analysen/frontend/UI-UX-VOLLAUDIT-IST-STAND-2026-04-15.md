# UI/UX Vollaudit — IST-Stand & Defektkatalog

**Datum:** 2026-04-15  
**Methode:** Browser-Audit (10 Views, Desktop + Responsive) + Code-Analyse (50+ Dateien)  
**Ergebnis:** 90 visuelle Befunde + 8 systemische Code-Inkonsistenzen  
**Ziel:** TM erstellt daraus priorisierte Arbeitspakete fuer `frontend-dev`

---

## Zusammenfassung fuer TM

Das Frontend hat ein **starkes Design-Token-System** (`tokens.css`) und gute Primitives (`BaseButton`, `BaseCard`, `BaseModal`). Die Inkonsistenzen konzentrieren sich auf **5 Kernprobleme**:

1. **Token-Drift**: ~50+ Dateien nutzen hardcoded `#hex`/`rgba` statt `var(--color-*)`, ~80+ Stellen mit `font-size: Npx` statt `--text-*` rem-Tokens
2. **Breakpoint-Chaos**: 15+ verschiedene Breakpoints (640, 767, 768, 900, 1024, 1100, 1279, 1280, 1366, 1399, 1440, 1536, 1700px) ohne einheitliches System
3. **Spacing-Mix**: Tailwind-Klassen (`gap-2`), CSS-Vars (`var(--space-3)`) und hardcoded `px` werden **innerhalb einzelner Komponenten** gemischt
4. **Leerzustaende**: 5+ Views ohne hilfreiche Empty States (Nutzer sieht leere Tabellen ohne Erklaerung/CTA)
5. **Visuelle Hierarchie**: Badge-Groessen, Button-Stile und Card-Hoehen variieren zwischen Views

---

## Teil A: Systemische Code-Defekte

### A1: Font-Size Token-Drift

**Befund:** ~80+ Stellen nutzen `font-size: Npx` (absolute Werte) statt `var(--text-*)` (rem-basiert, zoom-responsive).

| px-Wert | Betroffene Dateien (Auswahl) |
|---------|-------------------------------|
| 7px | `ActuatorSatellite.vue` |
| 8-9px | `ZonePlate.vue`, `DeviceHeaderBar.vue`, `DeviceMiniCard.vue`, `RangeSlider.vue` |
| 10px | `SensorCard.vue`, `ZonePlate.vue`, `CommandPalette.vue`, `ActuatorCard.vue`, `MonitorView.vue` |
| 11-13px | `FormGroup.vue`, `FormField.vue`, `DeviceDetailPanel.vue`, `DeviceMiniCard.vue` |
| 14-32px | `LiveDataPreview.vue`, `NotificationDrawer.vue` |

**Empfohlene Massnahme:**
- Mapping erstellen: 7px→0.4375rem (≈text-xxs), 9px→var(--text-xs), 10px→0.625rem, 11px→var(--text-xs), 12px→var(--text-xs), 13px→var(--text-sm), 14px→var(--text-sm), 24px→var(--text-xl)
- Alle `font-size: Npx` durch passenden Token oder rem ersetzen
- Geschaetzter Scope: ~30 Dateien, ~80 Ersetzungen

### A2: Hardcoded Farben

**Befund:** ~50+ `.vue`-Dateien enthalten hardcoded `#hex`-Farben ausserhalb `tokens.css`.

| Datei | Anzahl hex-Farben |
|-------|-------------------|
| `CalibrationWizard.vue` | 64 |
| `SensorHistoryView.vue` | 23 |
| `CalibrationStep.vue` | 19 |
| `CommandPalette.vue` | 14 |
| `ToastContainer.vue` | 14 |
| `SensorSatellite.vue` | 11 |
| `TimeRangeSelector.vue` | 11 |
| `UnifiedFilterBar.vue` | 10 |
| `ContextMenu.vue` | 8 |
| `ComponentCard.vue` | 7 |

**Empfohlene Massnahme:**
- Audit pro Datei: Welche Farben sind Chart-Lib-bedingt (akzeptabel) vs. UI-Farben (muessen Token nutzen)?
- Prioristaet: Dateien mit >10 Hardcodings zuerst
- Geschaetzter Scope: ~15 Dateien intensiv, ~35 Dateien einfach

### A3: Spacing-System-Mix

**Befund:** Innerhalb einzelner Komponenten werden 3 Systeme gemischt:
- Tailwind: `gap-2`, `p-3`, `px-4`
- CSS Vars: `var(--space-3)`, `var(--space-2)`
- Hardcoded px: `padding: 2px 6px`, `gap: 4px`

**Worst Offenders (mischen alle 3 in einer Datei):**
- `CommandPalette.vue`
- `ActionBar.vue`
- `ZonePlate.vue`
- `SensorCard.vue`
- `ESPSettingsSheet.vue`

**Empfohlene Massnahme:**
- Regel definieren: Scoped `<style>` nutzt ausschliesslich `var(--space-*)`, Template nutzt Tailwind
- Micro-Spacing (1-2px) fuer Badges/Badges ok als direkte rem-Werte
- Geschaetzter Scope: ~20 Dateien

### A4: Z-Index Magic Numbers

**Befund:** 19 Dateien nutzen hardcoded `z-index: N` statt `var(--z-*)` Tokens.

| z-index | Dateien |
|---------|---------|
| 1 | ESPCard, ConnectionLines, AnalysisDropZone, ZonePlate, ComponentSidebar, SetupView, LoginView, LogicView, MonitorTabs, HealthTab, EventTimeline, NotificationDrawer |
| 2 | RangeSlider |
| 5 | RuleFlowEditor (3x) |
| 10 | InlineDashboardPanel, UnifiedEventList, EventDetailsPanel, RuleFlowEditor |
| 20 | SensorCard, SensorsView |

**Empfohlene Massnahme:**
- Mapping: z-index 1→`var(--z-base)`, 5→`var(--z-sticky)`, 10→`var(--z-fixed)`, 20→`var(--z-dropdown)`
- Geschaetzter Scope: 19 Dateien, ~25 Ersetzungen

### A5: Border-Radius Inkonsistenzen

**Befund:** `tokens.css` definiert `--radius-sm|md|lg|full`. Komponenten nutzen zusaetzlich: `2px`, `3px`, `4px`, `9px`, `10px`, `12px`, `13px`, `0.125rem`, `0.25rem`, `0.375rem`, `0.5rem`, `0.625rem`, `0.75rem`, `1rem`, `9999px`.

**Empfohlene Massnahme:**
- Erweitere Token-Set um `--radius-xs: 0.125rem` (2px) fuer Micro-Badges
- Konvertiere alle hardcoded radius auf 4 Stufen: xs, sm, md, lg
- Geschaetzter Scope: ~25 Dateien

### A6: Breakpoint-Wildwuchs

**Befund:** 15+ unterschiedliche Breakpoints ohne System.

| Breakpoint | Verwendet in |
|------------|--------------|
| 640px | ZonePlate, StatusPill, DeviceMiniCard, SlideOver, BaseModal, MonitorView |
| 767px | TopBar, QuickActionBall |
| 768px | UnifiedFilterBar, AppShell, ESPOrbitalLayout |
| 900px | HardwareView |
| 1024px | ESPOrbitalLayout, HardwareView |
| 1100px | SystemMonitorView |
| 1280px | CustomDashboardView |
| 1366px | HardwareView |
| 1440px | SystemMonitorView |
| 1700/1701px | DeviceDetailView, TopBar |

**Empfohlene Massnahme:**
- Definiere 5 Breakpoints als CSS Custom Properties: `--bp-mobile: 640px`, `--bp-tablet: 768px`, `--bp-desktop: 1024px`, `--bp-wide: 1280px`, `--bp-ultrawide: 1536px`
- Oder nutze Tailwind-Breakpoints konsistent: sm(640), md(768), lg(1024), xl(1280), 2xl(1536)
- Migriere alle Media Queries auf das System
- Geschaetzter Scope: ~25 Dateien

### A7: BaseInput Token-Divergenz

**Befund:** `BaseInput.vue` nutzt Tailwind-Dark-Palette (`bg-dark-800`, `border-dark-600`) statt `var(--color-bg-*)` Design-Tokens. Das erzeugt visuellen Split zwischen Input-Feldern und dem Rest der UI.

**Empfohlene Massnahme:**
- `BaseInput` auf `var(--color-bg-secondary)`, `var(--glass-border)` umstellen
- Dasselbe fuer `BaseSelect` pruefen
- Geschaetzter Scope: 2-3 Dateien

### A8: Grid-Pattern Wildwuchs

**Befund:** Keine einheitliche Grid-Primitives. Jede View definiert eigene `grid-template-columns`:
- `repeat(auto-fill, minmax(200px, 1fr))` vs `minmax(220px, ...)` vs `minmax(280px, ...)` vs `minmax(300px, ...)` vs `minmax(400px, ...)`
- Feste Grids: `repeat(2, 1fr)`, `repeat(3, 1fr)`, `repeat(12, 1fr)`
- Clamp-Grids: `repeat(2, clamp(180px, 18vw, 240px))`

**Empfohlene Massnahme:**
- Grid-Utility-Klassen in `tokens.css` oder `layout.css`:
  ```css
  .grid-auto-sm { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  .grid-auto-md { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .grid-auto-lg { grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); }
  ```
- Geschaetzter Scope: ~15 Dateien

---

## Teil B: View-spezifische Befunde

### B1: Hardware View L1 (/)

| # | Befund | Schwere | Datei |
|---|--------|---------|-------|
| B1.1 | Warnbanner "Nicht zugewiesen" schwebt ohne visuelle Verbindung ueber Device-Cards | Major | `HardwareView.vue` |
| B1.2 | Zwei Device-Cards haben unterschiedliche Hoehen trotz aehnlichem Inhalt | Major | `ESPCardBase.vue` / `ESPCard.vue` |
| B1.3 | "+ Zone erstellen" Button am unteren Rand grau und leicht zu uebersehen | Minor | `HardwareView.vue` |
| B1.4 | Device-Card Schatten kaum sichtbar auf dunklem Hintergrund | Kosmetisch | `ESPCardBase.vue` |
| B1.5 | "MOCK" Badge positioniert sich eng am Device-Namen | Kosmetisch | `ESPCard.vue` |

### B2: Hardware View L2 — Device Detail (Orbital Layout)

| # | Befund | Schwere | Datei |
|---|--------|---------|-------|
| B2.1 | Einzelne Sensor-Card schwebt links mit riesigem Leerraum | Major | `ESPOrbitalLayout.vue` |
| B2.2 | Rechte Sidebar mit 13+ Icon-Buttons ohne Labels — Nutzer muss raten | Major | `ComponentSidebar.vue` |
| B2.3 | "Betriebsbereit" und "Ausgeschaltet" Badges widersprechen sich | Major | `ESPCard.vue` |
| B2.4 | Zurueck-Button im oberen linken Eck leicht zu uebersehen | Minor | `DeviceDetailView.vue` |
| B2.5 | Sensorwert "0,0" ohne Einheit-Anzeige | Minor | `SensorSatellite.vue` |
| B2.6 | Massiver Leerraum in der Mitte zwischen linker/rechter Spalte | Kosmetisch | `ESPOrbitalLayout.css` |

### B3: Monitor View

| # | Befund | Schwere | Datei |
|---|--------|---------|-------|
| B3.1 | Zone-Header "Geraete" mit widersprüchlicher Meldung darunter | Major | `MonitorView.vue` |
| B3.2 | Sensor-Cards im Expand-Modus: Chart-Hoehe nicht konsistent | Minor | `MonitorView.vue` |

### B4: Logic View

| # | Befund | Schwere | Datei |
|---|--------|---------|-------|
| B4.1 | "Automatisierung" Heading konkurriert visuell mit "Regel auswaehlen" | Major | `LogicView.vue` |
| B4.2 | Template-Cards zeigen zu wenig Info fuer informierte Auswahl | Major | `RuleTemplateCard.vue` |
| B4.3 | Collapsible "VORLAGEN & SCHNELLSTART (4)" hat unklaren Affordance (kleiner Chevron) | Minor | `LogicView.vue` |
| B4.4 | Template-Cards ohne Hover-Feedback | Kosmetisch | `RuleTemplateCard.vue` |

### B5: Components/Sensoren View

| # | Befund | Schwere | Datei |
|---|--------|---------|-------|
| B5.1 | Tabelle mit 1 Eintrag wirkt leer — braucht besseren Empty State | Kritisch | `SensorsView.vue` / `InventoryTable.vue` |
| B5.2 | Spaltenheader schwer lesbar (geringer Kontrast) | Major | `InventoryTable.vue` |
| B5.3 | Toolbar mit "Alle/Sensoren/Aktoren/Filter/Spalten" fuer simple View ueberladen | Major | `UnifiedFilterBar.vue` |
| B5.4 | NOT-AUS Button oben rechts ohne Kontext — unklar was er stoppt | Major | `EmergencyStopButton.vue` (Platzierung in `TopBar.vue`) |
| B5.5 | Kein Hover-State auf Tabellenzeilen | Minor | `InventoryTable.vue` |

### B6: System Monitor

| # | Befund | Schwere | Datei |
|---|--------|---------|-------|
| B6.1 | 9 Tabs ueberfordern — braucht Gruppierung | Major | `SystemMonitorView.vue` |
| B6.2 | Event-Timestamps ohne Datums-Kontext ("12:28:13") | Major | `UnifiedEventList.vue` |
| B6.3 | Filter-Pills eng beieinander — "Info/Warning/Fehler/Kritisch" eingequetscht | Major | `SystemMonitorView.vue` |
| B6.4 | Nur 2 Events in grossem Scrollbereich — wirkt leer | Minor | `UnifiedEventList.vue` |

### B7: Users View

| # | Befund | Schwere | Datei |
|---|--------|---------|-------|
| B7.1 | "Admin" Badge nutzt Alarm-Rot — typischerweise fuer Fehler reserviert | Minor | Users View |
| B7.2 | Datum "6/15/2026" in US-Format trotz deutscher UI | Minor | Users View |
| B7.3 | Edit/Delete Icons zu nah beieinander (Touch-Target-Problem) | Minor | Users View |

### B8: Calibration View

| # | Befund | Schwere | Datei |
|---|--------|---------|-------|
| B8.1 | 3 Status-Badges oben ("Device Offline", "Contract Idle", "Qualified Suspect") nicht erklaert | Major | `CalibrationWizard.vue` |
| B8.2 | Wizard-Kontext zeigt "Zone nicht zugewiesen" bevor Nutzer etwas gewaehlt hat | Major | `CalibrationWizard.vue` |
| B8.3 | Tab-Leiste ("Vorbereitung", "Messwertaufnahme", etc.) — aktueller Schritt unklar | Minor | `CalibrationWizard.vue` |

### B9: Plugins View

| # | Befund | Schwere | Datei |
|---|--------|---------|-------|
| B9.1 | Plugin-Cards zeigen nicht klar ob Plugin aktiv/inaktiv | Major | `PluginsView.vue` |
| B9.2 | Action-Buttons (Play/Stop, Settings) ohne Labels — raten noetig | Minor | `PluginsView.vue` |
| B9.3 | 4-Spalten-Grid hat enge horizontale Abstande | Minor | `PluginsView.vue` |

### B10: Email/Postfach View

| # | Befund | Schwere | Datei |
|---|--------|---------|-------|
| B10.1 | Empty State "Keine E-Mails gefunden" ohne Kontext oder CTA | Kritisch | Email View |
| B10.2 | Datumsfelder "Von/Bis" zeigen "mm/dd/yyyy" statt deutsches Format | Major | Email View |
| B10.3 | 6 Spaltenheader fuer leere Tabelle erzeugt visuelles Rauschen | Minor | Email View |

### B11: Globale/Cross-View Befunde

| # | Befund | Schwere | Betrifft |
|---|--------|---------|----------|
| B11.1 | TopBar zeigt unterschiedliche Inhalte pro View ohne konsistentes Pattern | Major | `TopBar.vue` |
| B11.2 | Sidebar Active-State inkonsistent — "Dashboard" gehighlighted aber URL ist `/hardware` | Major | `Sidebar.vue` |
| B11.3 | Badge-Groessen variieren zwischen Views (Padding, Font-Size, Border-Radius) | Major | Alle Badge-Komponenten |
| B11.4 | Primary Buttons nutzen unterschiedliche Blauschattierungen | Minor | Verschiedene Views |
| B11.5 | Graue Texte auf dunklem Hintergrund teilweise unter WCAG AA Kontrast | Minor | Tabellen-Header, Labels |

---

## Teil C: Priorisierte Arbeitspakete (Empfehlung an TM)

### Paket 1: Design-Token-Durchsetzung (Fundament) — P0

**Scope:** A1 + A2 + A3 + A4 + A5 + A7  
**Aufwand:** L (gross, ~40-60 Dateien, aber repetitiv)  
**Wirkung:** Eliminiert Token-Drift, macht alle Farben/Sizes/Spacing aenderbar via `tokens.css`  
**Agent:** `frontend-dev`  
**Reihenfolge:**  
1. A7 — BaseInput Token-Divergenz (2-3 Dateien, sofortiger Effekt)
2. A4 — Z-Index Magic Numbers (19 Dateien, sicherheitskritisch)
3. A5 — Border-Radius Normalisierung
4. A1 — Font-Size px→rem (groesster Batch)
5. A3 — Spacing-System Vereinheitlichung
6. A2 — Hardcoded Farben (groesster Batch, teilweise Chart-Lib-bedingt)

### Paket 2: Breakpoint-System (Layout-Fundament) — P0

**Scope:** A6 + A8  
**Aufwand:** M  
**Wirkung:** Konsistente Responsive-Breakpoints und Grid-Patterns  
**Agent:** `frontend-dev`  
**Abhaengigkeit:** Sollte VOR View-spezifischen Layout-Fixes passieren

### Paket 3: Empty States & Onboarding — P1

**Scope:** B5.1, B10.1, B6.4, B7 (leere Tabellen), B1.1  
**Aufwand:** M  
**Wirkung:** Nutzer versteht sofort was zu tun ist bei leeren Views  
**Agent:** `frontend-dev`

### Paket 4: View-spezifische Layout-Fixes — P1

**Scope:** B2.1-B2.6 (Hardware L2), B4.1-B4.4 (Logic), B6.1-B6.3 (System Monitor)  
**Aufwand:** M-L  
**Wirkung:** Professionelles Erscheinungsbild pro View  
**Agent:** `frontend-dev`  
**Abhaengigkeit:** Nach Paket 1+2

### Paket 5: Cross-View Konsistenz — P1

**Scope:** B11.1-B11.5 (TopBar, Sidebar, Badges, Buttons)  
**Aufwand:** M  
**Wirkung:** Einheitliches Look-and-Feel  
**Agent:** `frontend-dev`

### Paket 6: Accessibility & Locale — P2

**Scope:** B11.5 (WCAG Kontrast), B7.2 (US-Datumsformat), B10.2 (Datepicker Locale)  
**Aufwand:** S  
**Wirkung:** Professionelle i18n/a11y  
**Agent:** `frontend-dev`

---

## Teil D: Metriken

| Kategorie | Anzahl betroffene Dateien | Anzahl Befunde |
|-----------|--------------------------|----------------|
| Font-Size px (A1) | ~30 | ~80 Stellen |
| Hardcoded Farben (A2) | ~50 | ~200+ Stellen |
| Spacing-Mix (A3) | ~20 | ~120+ Stellen |
| Z-Index Magic (A4) | 19 | ~25 Stellen |
| Radius Inkonsistenz (A5) | ~25 | ~40 Stellen |
| Breakpoint-Wildwuchs (A6) | ~25 | 15+ Breakpoints |
| Input Token-Divergenz (A7) | 2-3 | ~10 Stellen |
| Grid-Wildwuchs (A8) | ~15 | ~15 Patterns |
| View-spezifisch (B*) | Alle Views | 55 Befunde |
| Cross-View (B11) | 5+ | 5 Befunde |
| **Gesamt** | **~80 Dateien** | **~90 visuelle + 8 systemische** |

---

## Naechster Schritt

TM uebernimmt dieses Dokument, priorisiert die Pakete, erstellt `TASK-PACKAGES.md` und dispatcht an `frontend-dev` nach dem etablierten Workflow (verify-plan Gate → Implementierung → Verifikation).
