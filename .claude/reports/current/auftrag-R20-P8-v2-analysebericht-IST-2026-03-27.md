# R20-P8-v2 — Vollständiger IST-Analysebericht (Code vs. Auftrag)

**Datum:** 2026-03-27  
**Bezug:** Auftrag „R20-P8-v2 — Dashboard UX Design-Analyse“ (ersetzt R20-P8 v1)  
**Methode:** Statische Code-Analyse der referenzierten Pfade (`El Frontend`, `El Servador/god_kaiser_server`), keine manuelle Geräte-Tests.

---

## Executive Summary

| Block | Thema | IST-Kurzfassung | Abweichung zum SOLL |
|-------|--------|-----------------|---------------------|
| 1 | Hover-Toolbar 5 Kontexte | Teilweise deckungsgleich; **ein Kontext weicht vom Auftragstext ab** | Zone-Mini-Widget nutzt `view`, nicht `manage`; CustomDashboard nutzt **kein** `InlineDashboardPanel` |
| 2 | Alert-Threshold-Sync | Keine Verknüpfung Widget ↔ Alert-API | Wie im Auftrag beschrieben: Lücke |
| 3 | ActuatorRuntimeWidget | Nur Store-Zustand (ON/OFF, `last_command_at`) | Wie im Auftrag: keine Laufzeit-/Duty-/History-Darstellung |
| 4 | Sensor-Aktor-Korrelation | `MultiSensorWidget` nur Sensoren | Keine `actuatorIds`, kein History-Overlay |
| 5 | Micro-UX | Fragmentarisch | Kein flächendeckendes Skeleton-/Highlight-/Stale-/Motion-Konzept |
| 6 | Touch-Audit | Gemischt | Inline-Panel: 44px nur bei `hover: none`; **Abstand Icons 2px**; Editor-Grid: 24×24px |
| 7 | WidgetConfigPanel-Zonen | Flache Form | Kein Accordion / keine 3 Zonen |
| 8 | Glass-3-Level | Nicht umgesetzt | `tokens.css`: ein Glass-Grund-Set, keine L1/L2/L3-Hierarchie wie spezifiziert |

---

## Block 1 — Hover-Toolbar / Fünf Kontexte

### Referenzimplementierung

- `InlineDashboardPanel.vue`: Manage-Toolbar nur wenn `isManageMode` = `mode === 'manage'` **und** `authStore.isAuthenticated`. Buttons `Settings`/`Trash2` 14px; Desktop-Buttons **28×28px**, bei `@media (hover: none)` **min 44×44px**. Toolbar `z-index: 10`. Parent `.inline-dashboard` und `.inline-dashboard__cell` haben `overflow: hidden` — Toolbar liegt oben rechts **innerhalb** der Zelle, typisch kein Abschneiden der Toolbar selbst; große Widget-Inhalte können weiterhin am Rand clippen.

### Kontext-Matrix (IST)

| # | Kontext (Auftrag) | IST im Code | PASS/FAIL vs. Auftragstabelle |
|---|-------------------|-------------|-------------------------------|
| 1 | CustomDashboardView Edit-Mode, `InlineDashboardPanel`, `manage` | **`CustomDashboardView.vue` nutzt kein `InlineDashboardPanel`.** Konfiguration über GridStack-Widget-Header (`useDashboardWidgets` mit `showConfigButton`, Gear/X-Buttons). | **Abweichung:** Gleiche Funktion (Settings/Entfernen), anderer Mechanismus — nicht „mode=manage“ auf `InlineDashboardPanel`. |
| 2 | MonitorView L2 Inline-Panels | `InlineDashboardPanel` mit `mode="manage"` (`inlineMonitorPanelsL2`) | **PASS** (wenn authentifiziert) |
| 3 | MonitorView L1 ZoneTileCard extra-Slot | `mode="view"` + `compact` — **kein Manage** | **FAIL** gegenüber Auftragstabelle („manage“ erwartet). IST: bewusst read-only Mini-Widget. |
| 4 | MonitorView Bottom-Panels | `mode="manage"` | **PASS** |
| 5 | MonitorView Side-Panels | `mode="side-panel"` — keine Manage-Toolbar (`isManageMode` false) | **PASS** |

### Zusatz: CustomDashboardView (Editor)

- Gear/Remove: **24×24px** (`CustomDashboardView.vue` `:deep(.dashboard-widget__gear-btn)`), Sichtbarkeit in Edit-Mode über **Header-Hover** (`opacity`). **Kein** `@media (hover: none)`-Pfad wie bei `InlineDashboardPanel` — Touch-Nutzung des Editors kann deutlich schlechter sein als im Monitor-Inline-Panel.

### Akzeptanzkriterien Block 1 (IST)

- [ ] „Alle 5 Kontexte wie in Tabelle“ — **nein** (Kontext 1/3 weichen ab).  
- [ ] Touch-Target ≥44px überall — **nur** für `InlineDashboardPanel` bei coarse/touch-Medien; **nicht** für GridStack-Editor-Header.  
- [ ] Konfiguration in max. 2 Schritten — GridStack: Header-Hover/Tap + Klick; abhängig von Gerät.

---

## Block 2 — Alert-Config Threshold Sync

### IST

- `src/api/sensors.ts`: `GET/PATCH` …`/sensors/{id}/alert-config` vorhanden. [Korrektur: nicht PUT, sondern PATCH — siehe `api.patch()` in sensors.ts:249]  
- `WidgetConfigPanel.vue`: manuelle Felder `warnLow`/`warnHigh`/`alarmLow`/`alarmHigh` (u. a. Zeilenbereich ~345–367) — **kein** Laden aus Alert-Config, **kein** Button „Schwellen aus Sensor-Config laden“.  
- `dashboard.store.ts` `generateZoneDashboard`: `showThresholds: false`, keine Alert-Config-Abfrage.  
- Accordion/3-Zonen: **nicht** vorhanden (Block 7).

**Fazit:** Entspricht der im Auftrag beschriebenen Lücke — Umsetzung offen.

---

## Block 3 — ActuatorRuntimeWidget & Server-APIs

### Frontend IST (`ActuatorRuntimeWidget.vue`)

- Datenquelle: `useEspStore` → `MockActuator`: `state`, `last_command_at`.  
- **Keine** Anzeige von `runtime_seconds`, Duty Cycle, Zyklen, kein CSS-Duty-Balken, keine Timeline.

### Backend IST (relevant)

- `GET /actuators/{actuator_id}/runtime` (`actuators.py`): liefert `runtime_stats` (JSON), `computed_uptime_hours`, `maintenance_overdue` — **Fokus Wartung**, nicht zwingend Live-Session aus `actuator_states.runtime_seconds` wie im UX-Mock beschrieben.  
- **History:** `GET /{esp_id}/{gpio}/history` (nicht `GET /actuators/{uuid}/history` wie im Auftragsbeispiel). Parameter u. a. `limit` (max **100**), `start_time`, `end_time` — **keine** aggregierte `duty_cycle_percent`/`total_cycles` in der Response (nur Liste `entries`).  
- Aggregation wie im Auftragsskizzen-JSON: **nicht** in diesem Endpoint sichtbar — ggf. Erweiterung oder zweiter Schritt nötig.

**Fazit:** Phase A/B des Auftrags sind **nicht** implementiert; Server bietet Teil-Infrastruktur (History-Liste, Runtime-JSON), aber nicht in der im Widget geforderten Form angebunden.

---

## Block 4 — Sensor-Aktor-Korrelation (MultiSensorWidget)

### IST (`MultiSensorWidget.vue`, Ausschnitt)

- Props/Konfig: Sensoren (`dataSources`), Compare-Mode, Zeitbereich — **kein** `actuatorIds`, keine Aktor-History, kein Chart.js-Hintergrund-Overlay für Aktoren.

**Fazit:** Block 4 vollständig offen; Auftragsentscheidung „Typ erweitern statt neuer Widget-Typ“ ist im Code noch nicht umgesetzt.

---

## Block 5 — Micro-Interactions

### IST (Stichprobe)

- Kein projektweites `widget-skeleton`-Pattern in den Dashboard-Widgets; `StatisticsWidget.vue` hat lokales Loading (`isLoading`), nicht das spezifizierte Shimmer-CSS.  
- Keine durchgängige `value-updated`-Klasse / WebSocket-Wert-Highlight in den Chart-/Card-Widgets.  
- `tokens.css`: **kein** `prefers-reduced-motion`-Block (Suche ohne Treffer).  
- Stale-Daten-Regel (2 Min) und Aktor-Transitions wie spezifiziert: **nicht** als einheitliches System erkennbar.

**Fazit:** Block 5 größtenteils **Spezifikation ohne IST-Implementierung**.

---

## Block 6 — Touch-Audit (InlineDashboardPanel + Editor)

### Messwerte aus Code (nicht DevTools)

| Element | Größe / Regel |
|---------|----------------|
| `InlineDashboardPanel` `.widget-toolbar__btn` | Desktop: **28×28px**; `@media (hover: none)`: **min 44×44px** |
| Toolbar-`gap` | **2px** (Auftrag: ≥8px Abstand zwischen Icons) — **Lücke** |
| `CustomDashboardView` Gear/Remove | **24×24px**, kein 44px-Override für Touch |

### Sichtbarkeit

- `InlineDashboardPanel`: bei `hover: none` Toolbar `opacity: 1` — **permanent sichtbar** auf typischen Touch-Browsern.

**Fazit:** Teilweise WCAG-konform für **InlineDashboardPanel** unter `hover: none`; Abstand und Editor-Grid bleiben Schwachstellen.

---

## Block 7 — WidgetConfigPanel: 3-Zonen-Restructuring

### IST

- `WidgetConfigPanel.vue`: flache Sections per `v-if` nach Widget-Typ (`hasSensorField`, `hasYRange`, …) — **kein** `<details>`/Accordion, keine expliziten Zonen „Kern / Darstellung / Erweitert“.

**Fazit:** Nicht umgesetzt; Voraussetzung für Block 2 (Progressive Disclosure der Thresholds) fehlt noch.

---

## Block 8 — Glass-Token 3-Level-Hierarchie

### IST (`tokens.css`)

- Vorhanden u. a.: `--glass-bg`, `--glass-bg-light`, `--glass-border`, `--glass-shadow` — **keine** `--glass-bg-l1/l2/l3`, `--glass-blur-l*` wie im Auftrag.  
- Kein dokumentierter Alias „altes `--glass-bg` → L2“ für eine Migration.  
- `@supports not (backdrop-filter: …)`-Fallback: in der Stichprobe **nicht** in `tokens.css` gefunden.

**Fazit:** Block 8 offen.

---

## Priorisierte Empfehlung (aus IST)

1. **Auftragsdokument korrigieren:** Kontext 1 (CustomDashboard) = GridStack-Header, nicht `InlineDashboardPanel`; Kontext 3 (Zone-Mini) = absichtlich `view` oder Auftrag auf „read-only“ anpassen.  
2. **Touch:** Editor-Buttons auf min. 44px unter `pointer: coarse` / `hover: none`; Toolbar-`gap` auf ≥8px.  
3. **Block 7 → Block 2:** Accordion zuerst, dann Alert-Sync-Button und Auto-Generation.  
4. **Block 3:** Klären, ob `runtime_seconds` aus WebSocket/REST kommt; History-Endpoint-Pfad `esp_id/gpio` in Frontend-API kapseln; Aggregation ggf. serverseitig erweitern.  
5. **Block 4:** Nach History-Anbindung `MultiSensorWidget` erweitern.  
6. **Block 5 + 8:** Design-Tokens und globale Motion-Regeln vor Widget-Flächenarbeit festziehen.

---

## Quellen (geprüfte Dateien, Auswahl)

- `El Frontend/src/components/dashboard/InlineDashboardPanel.vue`  
- `El Frontend/src/views/MonitorView.vue`  
- `El Frontend/src/views/CustomDashboardView.vue`  
- `El Frontend/src/composables/useDashboardWidgets.ts`  
- `El Frontend/src/components/dashboard-widgets/WidgetConfigPanel.vue`  
- `El Frontend/src/components/dashboard-widgets/ActuatorRuntimeWidget.vue`  
- `El Frontend/src/components/dashboard-widgets/MultiSensorWidget.vue`  
- `El Frontend/src/shared/stores/dashboard.store.ts` (`generateZoneDashboard`)  
- `El Frontend/src/styles/tokens.css`  
- `El Servador/god_kaiser_server/src/api/v1/actuators.py` (`/runtime`, `/{esp_id}/{gpio}/history`)

---

*Ende des IST-Analyseberichts.*
