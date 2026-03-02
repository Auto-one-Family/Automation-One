# Auftrag: Dashboard + Logik UX — Finaler Polish, CSS-Konsistenz und State-Stabilitaet

> **Erstellt:** 2026-03-02
> **Erstellt von:** Automation-Experte (Life-Repo), basierend auf Robins Analyse + Screenshots + bestehenden Auftraegen
> **Ziel-Repo:** auto-one
> **Typ:** Analyse → Bug-Fix → UX-Polish (2 Phasen)
> **Status:** ERLEDIGT (2026-03-02)

---

## Ergebnis-Zusammenfassung

### Phase 1: Dashboard Editor + Monitor Dashboard UX

| Block | Beschreibung | Status | Dateien |
|-------|-------------|--------|---------|
| **1.1** | State-Verlust bei Tab-Wechsel (KRITISCH) | GEFIXT | AppShell, MonitorView, LogicView, CustomDashboardView, dashboard.store |
| **1.2** | CSS-Konsistenz Custom Dashboard Widgets | GEFIXT | ActuatorRuntimeWidget, ActuatorCardWidget, AlarmListWidget, MultiSensorWidget, DashboardViewer |
| **1.3** | DashboardOverviewCard im Monitor | GEFIXT | MonitorView (neue kompakte Card-Sektion) |
| **1.4** | InlineDashboardPanel CSS-Haertung | GEFIXT | InlineDashboardPanel (ROW_HEIGHT + overflow) |
| **1.5** | Dashboard-Breadcrumbs + ID-Konsistenz | BEREITS OK | Watch mit immediate:true war korrekt |

### Phase 2: Logik/Rules Tab UX

| Block | Beschreibung | Status | Dateien |
|-------|-------------|--------|---------|
| **2.1+2.4** | Layout umstrukturieren + Vorlagen collapsible | GEFIXT | LogicView |
| **2.2** | Vorkonfigurationen pruefen | VERIFIZIERT OK | rule-templates.ts (alle korrekt) |
| **2.3** | execution_count Fix + RuleCard Status | GEFIXT | logic.store |

---

## Detaillierte Fixes

### Block 1.1: State-Verlust bei Tab-Wechsel (KRITISCH)

**Ursache:** RouterView in AppShell ohne keep-alive — Views wurden bei Tab-Wechsel zerstoert.

**Fixes:**
1. AppShell: keep-alive mit include fuer MonitorView, LogicView, CustomDashboardView
2. defineOptions Name hinzugefuegt in allen 3 Views
3. CustomDashboardView: onActivated/onDeactivated fuer GridStack-Lifecycle
4. dashboard.store: Per-Layout Debounce-Timer (Map statt globalem Timer)

### Block 1.2: CSS-Konsistenz

- font-size: 10px → var(--text-xs) (4 Stellen)
- padding: 2px 8px → var(--space-1) var(--space-2) (4 Stellen)
- gap: 4px → var(--space-1) (2 Stellen)
- rgba Status-Farben → var(--color-zone-*) mit Fallback
- DashboardViewer: inset:4px entfernt (konsistent mit GridStack-Default)

### Block 1.3: DashboardOverviewCard

Einfache Link-Liste durch kompakte Card mit horizontalen Chips ersetzt:
- Collapse-Toggle mit localStorage-State
- Dashboard-Chips (Name, Widget-Count, Edit-Icon)
- "+" Button und "Mehr anzeigen"

### Block 1.4: InlineDashboardPanel

- ROW_HEIGHT 60px → 80px (synchron mit CustomDashboardView)
- overflow mount-div von hidden auf auto (Text-Widgets scrollen)

### Block 2.1+2.4: LogicView Layout

Eigene Regeln OBEN (primaer), Vorlagen UNTEN (collapsible):
- Horizontales CSS Grid fuer RuleCards
- Collapsible Templates-Sektion mit Smooth-Transition
- Empty State nur ohne Regeln

### Block 2.3: execution_count Fix

Bug: WebSocket logic_execution inkrementierte execution_count nicht.
Fix: 1 Zeile in logic.store + last_execution_success Update.

---

## Verifikation

- vue-tsc --noEmit: 0 Fehler
- vite build: Erfolgreich (28.55s)
- 12 geaenderte Dateien kompilieren fehlerfrei
