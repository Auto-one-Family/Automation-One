# Monitor L1 — „Aktive Automatisierungen“ — Vollständige IST-Analyse

> **Erstellt:** 2026-03-06  
> **Ziel-Repo:** auto-one (El Frontend)  
> **Typ:** Analyse (kein Code, nur Bestandsaufnahme)  
> **Priorität:** HOCH — Basis für komplette UI/UX-Optimierung  
> **Voraussetzung:** Monitor L1 „Aktive Automatisierungen“ implementiert

---

## 1. Executive Summary

Die Monitor L1 Sektion „Aktive Automatisierungen“ ist **vollständig implementiert** und entspricht der Referenz-Spezifikation in weiten Teilen. Sie zeigt alle aktivierten Regeln (logicStore.enabledRules), sortiert nach Fehler zuerst, dann Priorität, dann Name, maximal 5 RuleCardCompact-Karten plus Link „Alle Regeln“. Die Zone-Badge („Wo?“) wird über `getZonesForRule(rule)` berechnet und an RuleCardCompact übergeben. **Haupt-Gaps:** (1) ZoneRulesSection hat im Empty State keinen Link zum Regeln-Tab, ActiveAutomationsSection schon — Inkonsistenz; (2) Regel ohne Zone (extractEspIdsFromRule leer oder ESP nicht in devices) zeigt leeren Badge — kein Fallback „—"; (3) `last_execution_success === undefined` (Regel nie gefeuert) wird wie „OK“ behandelt — Fehler-Sortierung ignoriert diesen Fall; (4) Responsive-Verhalten des monitor-card-grid bei schmalem Viewport nicht explizit getestet; (5) ARIA-live für dynamische Status-Änderungen fehlt.

---

## 2. Komponenten-Inventar

### A: ActiveAutomationsSection.vue

| # | Frage | IST |
|---|-------|-----|
| **A1** | Existiert? Pfad, Zeilenzahl | Ja. `El Frontend/src/components/monitor/ActiveAutomationsSection.vue` — **199 Zeilen** (Script 53, Template 48, Style 98) |
| **A2** | Props, Emits, Slots | **Keine Props, keine Emits, keine Slots** — rein datengetrieben über logicStore |
| **A3** | Composables/Stores | `useLogicStore()`, `useRouter()` |
| **A4** | Template-Struktur | `<section class="active-automations-section monitor-section">` → `<h3>`, Empty State (v-if enabledCount===0) oder Content (v-else): `monitor-card-grid` mit RuleCardCompact[], Footer mit Link |
| **A5** | RuleCardCompact — Pfad, Zeilenzahl | `El Frontend/src/components/logic/RuleCardCompact.vue` — **277 Zeilen** |
| **A6** | Einbindung in MonitorView | Zeile 1498–1499: `<ActiveAutomationsSection />` — **ohne v-if**, nur innerhalb `v-if="!isZoneDetail"` (L1-Bereich). Position: direkt nach `monitor-zone-grid`, vor `monitor-dashboard-card` |

### E: RuleCardCompact — Detailanalyse

| # | Frage | IST |
|---|-------|-----|
| **E1** | zoneNames Prop | `zoneNames?: string[]`, optional, Default: `() => []` |
| **E2** | Zone-Badge Kürzung | Bei `names.length <= 2`: `names.join(', ')`. Bei `>2`: `${names[0]} +${names.length - 1}` |
| **E3** | Badge-Styling | `rule-card-compact__zone-badge`: `font-size: var(--text-xs)`, `border-radius: var(--radius-sm)`, `max-width: 120px`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`. **Unterschied zu SensorCard:** SensorCard nutzt `padding: 2px 8px`, `border: 1px solid var(--glass-border)`, `max-width: 140px`; RuleCardCompact nutzt `padding: 2px 6px`, **kein** border, `max-width: 120px` |
| **E4** | Fehler-Rand | `rule-card-compact--error`: `border-left: 3px solid var(--color-status-alarm)`, `border-color: rgba(248, 113, 113, 0.4)` |
| **E5** | Glow bei isActive | `rule-card-compact--active`: Animation `rule-compact-flash` 1.5s — box-shadow + border-color grün, dann ausblenden |
| **E6** | Klick-Handler | `router.push({ name: 'logic-rule', params: { ruleId: props.rule.id } })` |
| **E7** | shortDescription | Erste Sensor/Sensor-Threshold-Condition + erste Actuator/Actor-Command-Action. Fallback: Zeitbedingung → „Zeitbasiert", sonst null. Format: `condPart + actionPart` (z.B. `ds18b20 > 25 → ON`) |

---

## 3. Datenfluss & Logik

### B: Datenfluss

| # | Frage | IST |
|---|-------|-----|
| **B1** | topRules Sortierung | `aErr = last_execution_success === false ? 0 : 1` (Fehler zuerst), dann `priority ?? 0`, dann `name.localeCompare()`. `slice(0, 5)`. **Edge Case:** `last_execution_success === undefined` (nie gefeuert) → aErr=1 → wie „OK" sortiert |
| **B2** | getZonesForRule | `logic.store.ts` Zeilen 324–336. Signatur: `getZonesForRule(rule: LogicRule): string[]`. Algorithmus: extractEspIdsFromRule → für jeden espId Device in espStore.devices suchen (getDeviceId(d) === espId) → zone_name ?? zone_id → Set → sortiert zurück |
| **B3** | extractEspIdsFromRule | `types/logic.ts` Zeilen 266–288. Ausgewertet: SensorCondition.esp_id, HysteresisCondition.esp_id (rekursiv in CompoundCondition), ActuatorAction.esp_id |
| **B4** | espStore.devices Felder | `device_id`, `esp_id`, `zone_id`, `zone_name`. Lookup via `getDeviceId(d) === espId` (device_id \|\| esp_id) |
| **B5** | enabledRules | Computed: `rules.value.filter(rule => rule.enabled)` |
| **B6** | isRuleActive | `activeExecutions.value.has(ruleId)` — Map wird bei WebSocket `logic_execution` Event gesetzt, nach 2s gelöscht |

### Datenfluss-Zusammenfassung

```
User öffnet /monitor
  → MonitorView rendert L1 (v-if="!isZoneDetail")
  → ActiveAutomationsSection onMounted: logicStore.fetchRules() wenn rules.length === 0
  → topRules = enabledRules sortiert (Fehler, priority, name), slice(0,5)
  → Für jede Regel: logicStore.getZonesForRule(rule) → zoneNames
  → RuleCardCompact erhält rule, isActive=logicStore.isRuleActive(rule.id), zoneNames
  → Klick auf Card → router.push({ name: 'logic-rule', params: { ruleId } })
```

---

## 4. Styling-Dokumentation

### C: Styling

| # | Frage | IST |
|---|-------|-----|
| **C1** | ActiveAutomationsSection CSS-Klassen | `active-automations-section`, `monitor-section`, `active-automations-section__empty`, `__empty-icon`, `__empty-text`, `__empty-hint`, `__empty-link`, `__content`, `__footer`, `__link`, `monitor-card-grid` |
| **C2** | tokens.css Variablen | `--space-10`, `--space-4`, `--space-2`, `--space-1`, `--space-6`, `--space-3`, `--text-sm`, `--text-xs`, `--color-iridescent-2`, `--color-iridescent-1`, `--color-bg-secondary`, `--color-bg-tertiary`, `--glass-border`, `--radius-md`, `--radius-sm`, `--transition-fast`, `--color-text-secondary`, `--color-text-muted` |
| **C3** | Abstände | Section: `margin-bottom: var(--space-10)`. Content: `gap: var(--space-4)`. Empty: `padding: var(--space-6) var(--space-4)`, `gap: var(--space-2)` |
| **C4** | RuleCardCompact Styling | Status-Dot: 8×8px, `--color-status-good`, `--color-status-alarm`, `--color-text-muted`. Zone-Badge: `--text-xs`, `--radius-sm`, `--color-bg-tertiary`. Fehler-Rand: `--color-status-alarm` |
| **C5** | Empty State Vergleich | ActiveAutomationsSection: Zap-Icon, „Keine aktiven Automatisierungen", Hinweis, **Button „Zum Regeln-Tab"**. ZoneRulesSection: Zap-Icon, „Keine Automatisierungen für diese Zone", Hinweis — **kein Link/Button** |
| **C6** | Link „Alle Regeln" | `font-size: var(--text-sm)`, `font-weight: 500`, `color: var(--color-iridescent-2)`, Hover: `--color-iridescent-1`, `padding: var(--space-1) var(--space-2)`, `border-radius: var(--radius-sm)` |

---

## 5. L1-Kontext & Reihenfolge

### D: L1-Reihenfolge

| # | Frage | IST |
|---|-------|-----|
| **D1** | Exakte DOM-Reihenfolge | 1. `monitor-l1-header` (System-Summary), 2. Empty State (wenn zoneKPIs.length===0), 3. `monitor-zone-grid` (Zone-Tiles), 4. **ActiveAutomationsSection**, 5. `monitor-dashboard-card` (Dashboards (N)), 6. `InlineDashboardPanel` (inline) |
| **D2** | v-if Bedingung | `v-if="!isZoneDetail"` um gesamten L1-Block. ActiveAutomationsSection hat **kein eigenes** v-if — wird immer gerendert wenn L1 aktiv |
| **D3** | Abstände | `monitor-zone-grid`: `margin-bottom: var(--space-10)`. ActiveAutomationsSection: `margin-bottom: var(--space-10)`. monitor-dashboard-card: `margin-bottom: var(--space-10)` |
| **D4** | Responsive | `monitor-card-grid`: `grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))`, `gap: var(--space-3)`. Kein expliziter Breakpoint für ActiveAutomationsSection. monitor-zone-grid: `@media (max-width: 639px) { grid-template-columns: 1fr }` |

---

## 6. Empty State & Edge Cases

### F: Edge Cases

| # | Frage | IST |
|---|-------|-----|
| **F1** | Empty State (0 Regeln) | Icon: Zap (32×32). Text: „Keine aktiven Automatisierungen". Hint: „Regeln können im Regeln-Tab erstellt und aktiviert werden". Link: Button „Zum Regeln-Tab" (ExternalLink Icon) → `goToLogicTab()` → `router.push({ name: 'logic' })` |
| **F2** | 1–5 vs. >5 Regeln | Immer `topRules.slice(0, 5)`. Link-Text: `hasMoreRules ? \`Alle ${enabledCount} Regeln anzeigen\` : 'Alle Regeln'` |
| **F3** | Regel ohne Zone | `getZonesForRule` liefert `[]`. `zoneBadgeText` → `null`. Badge wird nicht gerendert (`v-if="zoneBadgeText"`). **Kein Fallback „—"** |
| **F4** | last_execution_success undefined | In topRules-Sortierung: `aErr = 1` (wie OK). In RuleCardCompact: `hasError = last_execution_success === false` → false. Kein Fehler-Rand, kein AlertCircle. **Korrekt:** Nie gefeuert = kein Fehler |
| **F5** | fetchRules() wann? | `onMounted`: `if (logicStore.rules.length === 0) logicStore.fetchRules()` |

---

## 7. SOLL-IST-Matrix (UX-Prinzipien)

### G: UX-Prinzipien

| # | Prinzip | SOLL | IST | Gap |
|---|---------|------|-----|-----|
| **G1** | 5-Sekunden-Regel | „Laufen Automatisierungen? Sind sie OK? Wo?" in <5s | Zone-Badge sichtbar bei L1. Status-Dot + Label. Fehler-Rand. | **Klein:** Bei Regel ohne Zone fehlt Badge — „Wo?" unklar |
| **G2** | Gamification | Wie Computerspiel, Status sofort erkennbar, Glow bei Aktivität | Status-Dot, Glow (1.5s), Fehler-Rand, AlertCircle bei Fehler | **Erfüllt** |
| **G3** | Progressive Disclosure | Overview zuerst, Details on demand | Top-5 + Link „Alle Regeln" | **Erfüllt** |
| **G4** | 40px Trennung | --space-10 zwischen Major Sections | `margin-bottom: var(--space-10)` auf Section | **Erfüllt** |
| **G5** | Konsistenz mit Alerts | Alerts zeigen Zone/Source — Regeln zeigen Zone-Badge | Zone-Badge vorhanden. NotificationItem zeigt Source-Badge (Sensor/Regel/etc.), nicht Zone. **Unterschiedlich** — Alerts nutzen Source, Regeln Zone | **Info:** Semantisch unterschiedlich, kein Gap |
| **G6** | Read-Only | Kein Toggle, kein Delete | Nur Klick (Navigation) und Link | **Erfüllt** |

### J: Gaps zur Roadmap

| # | Anforderung | Quelle | IST | Gap |
|---|-------------|--------|-----|-----|
| **J1** | L1-Reihenfolge: Zonen → Aktive Automatisierungen → Cross-Zone-Dashboards → Dashboards → Inline | ROADMAP | Zonen → ActiveAutomationsSection → monitor-dashboard-card (Dashboards) → InlineDashboardPanel | **Erfüllt** |
| **J2** | Zone-Badge Pflicht (5-Sekunden-Regel: „Wo?") | auftrag-monitor-l1 | Zone-Badge bei L1, fehlt bei Regel ohne Zone | **Klein:** Fallback „—" oder „Unbekannt" fehlt |
| **J3** | Max 5 RuleCardCompact | auftrag-monitor-l1 | `MAX_DISPLAYED = 5`, `slice(0, 5)` | **Erfüllt** |
| **J4** | Fehler zuerst, dann priority/name | auftrag-monitor-l1 | Sortierung implementiert | **Erfüllt** |
| **J5** | Gamification: visuell belohnend, kein Tabellen-Look | iot-dashboard-ux-gamification | Cards, Status-Dot, Glow, keine Tabelle | **Erfüllt** |

---

## 8. Referenz-Vergleich

### H: Referenz-Vergleich

| # | Komponente | Aspekt | ActiveAutomationsSection | Referenz | Abweichung? |
|---|-------------|--------|---------------------------|----------|-------------|
| **H1** | ZoneRulesSection | Überschrift-Format | „Aktive Automatisierungen (N)" | „Regeln für diese Zone (N)" | **Nein** — gleiches Pattern |
| **H2** | ZoneRulesSection | Empty State | Zap, Hinweis, **Button „Zum Regeln-Tab"** | Zap, Hinweis — **kein Link** | **Ja** — ActiveAutomationsSection hat Link, ZoneRulesSection nicht |
| **H3** | SensorCard | Subzone-Badge | Zone-Badge auf RuleCardCompact | `--text-xs`, `--radius-sm`, `padding: 2px 8px`, `border: 1px solid`, `max-width: 140px` | **Ja** — RuleCardCompact: `padding: 2px 6px`, kein border, `max-width: 120px` |
| **H4** | ActuatorCard | „Bedient Subzone" | Zone-Badge | Zeile „Bedient: {name}" mit `actuator-card__served` | **Nein** — unterschiedlicher Kontext (Regel vs. Aktor) |
| **H5** | NotificationItem | Zone/Source | Zone-Badge | Source-Badge (Sensor, Regel, etc.) | **Nein** — unterschiedliche Semantik |
| **H6** | Zone-Kacheln (L1) | Abstand, Section-Container | `monitor-section`, `margin-bottom: var(--space-10)` | `monitor-zone-grid` hat `margin-bottom: var(--space-10)` | **Nein** — konsistent |

---

## 9. Accessibility & Responsive

### I: Accessibility

| # | Frage | IST |
|---|-------|-----|
| **I1** | Semantische HTML-Elemente | `<section>`, `<h3>`, `<button>` für Cards und Links. **Kein** `<ul>/<li>` für Rule-Liste |
| **I2** | ARIA-Labels | RuleCardCompact: `aria-label="Regel ${rule.name} öffnen"`. Link: `aria-label` dynamisch (hasMoreRules ? „Alle N Regeln anzeigen" : „Alle Regeln im Regeln-Tab bearbeiten") |
| **I3** | ARIA-live | **Fehlt** — dynamische Status-Änderungen (Fehler, Glow) nicht announced |
| **I4** | Keyboard-Navigation | Button-Elemente → Tab-fähig. Enter/Space aktivieren Klick |
| **I5** | Focus-States | Keine expliziten `:focus-visible` Styles in RuleCardCompact/ActiveAutomationsSection |
| **I6** | Responsive | `monitor-card-grid`: `minmax(200px, 1fr)` — Cards stapeln bei schmalem Viewport. Kein Breakpoint speziell für ActiveAutomationsSection |

---

## 10. Priorisierte Optimierungsliste

| # | Optimierung | Datei(en) | Aufwand | Priorität | Begründung |
|---|-------------|-----------|---------|-----------|------------|
| 1 | Zone-Badge Fallback „—" bei leerem getZonesForRule | RuleCardCompact.vue | Klein | P1 | 5-Sekunden-Regel: „Wo?" auch bei Regeln ohne Zone beantworten |
| 2 | ZoneRulesSection Empty State: Link „Zum Regeln-Tab" hinzufügen | ZoneRulesSection.vue | Klein | P1 | Konsistenz mit ActiveAutomationsSection |
| 3 | Zone-Badge Styling an SensorCard angleichen (border, padding) | RuleCardCompact.vue | Klein | P2 | Design-System-Konsistenz |
| 4 | ARIA-live für Status-Änderungen (Fehler, Glow) | RuleCardCompact.vue, logic.store | Mittel | P2 | Accessibility für Screenreader |
| 5 | Focus-States für RuleCardCompact und Link-Buttons | ActiveAutomationsSection.vue, RuleCardCompact.vue | Klein | P2 | Keyboard-Navigation sichtbar |
| 6 | last_execution_success undefined in Sortierung: als „neutral" behandeln (nach Fehlern, vor OK) | ActiveAutomationsSection.vue | Klein | P3 | Edge Case: Nie gefeuert = weder Fehler noch bestätigt OK |
| 7 | Semantische Liste: `<ul role="list"><li>` für RuleCardCompact-Container | ActiveAutomationsSection.vue | Klein | P3 | Bessere Semantik |
| 8 | Responsive-Test bei <400px Viewport | — | Test | P3 | Sicherstellen, dass Cards lesbar bleiben |

---

## 11. Offene Fragen

1. **Regel ohne Zone:** Soll bei `getZonesForRule` leer ein Badge „—" oder „Unbekannt" angezeigt werden, oder bewusst weggelassen?
2. **ZoneRulesSection Link:** Soll der Empty State von ZoneRulesSection einen expliziten „Zum Regeln-Tab"-Button erhalten (wie ActiveAutomationsSection) für Konsistenz?
3. **last_execution_success undefined:** Soll „nie gefeuert" in der Sortierung zwischen „Fehler" und „OK" landen (als eigene Kategorie) oder ist aktuelles Verhalten (wie OK) gewollt?
4. **NotificationItem Zone:** Zeigt NotificationItem aktuell eine Zone im Detail-Grid? (Analyse: metadata.zone_id/zone_name — nicht in NotificationItem Template gefunden; nur source, esp_id, sensor_type etc.)

---

## 12. Datei-Referenzen (Zeilennummern Stand 2026-03-06)

| Datei | Relevante Zeilen |
|-------|------------------|
| ActiveAutomationsSection.vue | 1–199 |
| RuleCardCompact.vue | 1–277 |
| logic.store.ts | 102–105 (enabledRules), 324–336 (getZonesForRule), 368–370 (isRuleActive) |
| types/logic.ts | 266–288 (extractEspIdsFromRule) |
| MonitorView.vue | 1408–1556 (L1-Block), 1498–1499 (ActiveAutomationsSection) |
| tokens.css | 99 (--space-10), 114–115 (--radius-sm), 182 (--text-xs), 209–211 (--color-status-*) |
| ZoneRulesSection.vue | 66–79 (Empty State ohne Link) |
| SensorCard.vue | 326–339 (subzone-badge Styling) |

---

*Ende der IST-Analyse*
