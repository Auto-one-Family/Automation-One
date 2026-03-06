# Dashboard-Übersicht — Layout-Analyse Level 1 & Level 2 (getrennt)

> **Erstellt:** 2026-03-06  
> **Typ:** Bestandsaufnahme + SOLL-IST-Matrix + Priorisierte Verbesserungsliste  
> **Basis:** Auftrag-Dokument (Dashboard-Übersicht Layout-Analyse), MonitorView.vue IST-Analyse  
> **Status:** Phase 1 Monitor-Layout implementiert (2026-03-06): L2 Reihenfolge, Zählung, ESP-Count, Dashboard-Suffix, 40px Trennung. L2 Regeln für diese Zone (ZoneRulesSection) implementiert 2026-03-06. L1 Aktive Automatisierungen (ActiveAutomationsSection) implementiert 2026-03-06. Phase 3.3+E3 (2026-03-06): Zone-Filter im WidgetConfigPanel, L2 Inline-Panels nach scope/zoneId gefiltert.

---

## 1. Abgrenzung: Level 1 vs. Level 2

| Ebene | Route | Bedingung | View-Bereich |
|-------|-------|-----------|--------------|
| **Level 1** | `/monitor` | `!isZoneDetail` | Zeilen 1375–1523 |
| **Level 2** | `/monitor/:zoneId` | `isZoneDetail` | Zeilen 1526–1833 |

**Quelle:** `isZoneDetail = computed(() => !!selectedZoneId.value)` (Zeile 83)

---

## 2. Level 1 — Zonen-Übersicht (Monitor Startseite)

### 2.1 DOM-Struktur & Reihenfolge (IST)

| # | Sektion | Zeilen | Komponente/Element | Sichtbar |
|---|---------|--------|-------------------|----------|
| 1 | L1 Header (System Summary) | 1376–1389 | `monitor-l1-header` | Zone-Count, Sensoren online, Alarme |
| 2 | Empty State | 1391–1395 | `monitor-view__empty` | Nur wenn `zoneKPIs.length === 0` |
| 3 | Zone Tiles Grid | 1397–1460 | `monitor-zone-grid` → `monitor-zone-tile` | Pro Zone: Name, Status, KPIs, Counts |
| 4 | Aktive Automatisierungen (N) | 1498–1500 | `ActiveAutomationsSection` | logicStore.enabledRules, Top 5 RuleCardCompact, Zone-Badge, Link "Alle Regeln" |
| 5 | Dashboards (N) Karte | 1502–1545 | `monitor-dashboard-card` | Cross-Zone-Dashboards als Chips |
| 6 | InlineDashboardPanel | 1548–1554 | `InlineDashboardPanel` | `dashStore.inlineMonitorPanels` (Cross-Zone, scope !== 'zone') |
| 7 | Bottom-Panel (optional) | — | `monitor-layout__bottom` | `dashStore.bottomMonitorPanels` — unter main, L1+L2 |

### 2.2 Datenquellen Level 1

| Daten | Quelle | Zeile |
|-------|--------|-------|
| `zoneKPIs` | `computed` aus `groupDevicesByZone(espStore.devices)` | 863–936 |
| `systemSummary` | `computed` aus `zoneKPIs` | 953–962 |
| `logicStore.enabledRules` | Logic Store (aktivierte Regeln) | ActiveAutomationsSection |
| `logicStore.getZonesForRule(rule)` | Zone-Namen pro Regel (ESP→Zone) | RuleCardCompact Zone-Badge |
| `visibleCrossZoneDashboards` | `dashStore.crossZoneDashboards` (gekürzt) | 976–982 |
| `dashStore.inlineMonitorPanels` | Dashboard Store (Cross-Zone) | — |
| `dashStore.bottomMonitorPanels` | Dashboard Store | — |

### 2.3 ZoneKPI Interface (IST)

```typescript
// Zeilen 806–825
interface ZoneKPI {
  zoneId: string
  zoneName: string
  sensorCount: number
  actuatorCount: number
  activeSensors: number
  activeActuators: number
  alarmCount: number
  aggregation: ReturnType<typeof aggregateZoneSensors>
  lastActivity: string | null
  healthStatus: ZoneHealthStatus
  healthReason: string
  onlineDevices: number   // ← Im Footer als "X/Y online" angezeigt
  totalDevices: number    // ← Im Footer als "X/Y online" angezeigt
}
```

**Pro Zone-Kachel angezeigt (IST, nach Phase 1):**
- `zoneName`, `healthStatus`, `healthReason`
- `aggregation.sensorTypes` (Temp-Range, Feuchte-Range etc.)
- **ESP-Count:** `onlineDevices`/`totalDevices` als "X/Y online" im Footer
- `activeSensors`/`sensorCount`, `actuatorCount`, `activeActuators`
- `lastActivity`

### 2.4 Level-1 SOLL-IST-Matrix

| Element | IST (Zeile, Komponente) | SOLL (Auftrag) | Abweichung |
|---------|-------------------------|----------------|------------|
| Zonen-Kacheln | 1397–1460, `monitor-zone-tile` | P0, zuerst | ✓ Korrekt |
| Pro Zone: Name, KPIs, Counts | 1406–1457 | P0 | ✓ OK |
| Pro Zone: ESP-Count | Footer "X/Y online" | P0 (optional) | ✓ Implementiert |
| Aktive Automatisierungen (N) | 1498–1500, `ActiveAutomationsSection` | P1, nach Zonen | ✓ Implementiert 2026-03-06 |
| Cross-Zone-Dashboards | 1502–1545, Chips | P1, LinkCards | ⚠️ Chips statt LinkCards |
| Inline-Panels | 1548–1554 | P1, am Ende | ✓ OK |
| Reihenfolge: Zonen → Automatisierungen → Dashboards → Inline | 1397 → 1498 → 1502 → 1548 | Zonen zuerst | ✓ Korrekt |
| 40px Trennung Major Sections | var(--space-10) auf Sektionen | UX-Prinzip | ✓ Implementiert |

### 2.5 Level-1-Inventar (Checkliste)

- [x] Zonen-Kacheln (Hauptinhalt zuerst)
- [x] Aktive Automatisierungen (N) — ActiveAutomationsSection (2026-03-06)
- [x] "Dashboards (N)"-Karte (nach Zonen)
- [x] InlineDashboardPanel(s) (am Ende)
- [ ] Cross-Zone-LinkCards (fehlt — aktuell Chips, kein separates LinkCard-Design)
- [x] ESP-Count pro Zone ("X/Y online" im Footer)

---

## 3. Level 2 — Zonen-Detail (eine Zone)

### 3.1 DOM-Struktur & Reihenfolge (IST, nach Phase 1)

| # | Sektion | Komponente/Element | Sichtbar |
|---|---------|-------------------|----------|
| 1 | Ready-Gate | BaseSkeleton / ErrorState | Bei Load/Error |
| 2 | Zonen-Header | `monitor-view__header` | Back, Zone-Nav, Zone-KPIs |
| 3 | Sensoren (N) | `monitor-section` | Sektionsüberschrift + Subzone-Accordion |
| 4 | Aktoren (N) | `monitor-section` | Sektionsüberschrift + Subzone-Accordion |
| 5 | Regeln für diese Zone (N) | `ZoneRulesSection` | logicStore.getRulesForZone; RuleCardCompact; Klick → /logic/:ruleId; Bei >10: nur 5 + Link "Im Regeln-Tab anzeigen" |
| 6 | Zone-Dashboards | `monitor-dashboards` | **Nach** Sensoren/Aktoren/Regeln |
| 7 | InlineDashboardPanel | `InlineDashboardPanel` | inlineMonitorPanelsL2: Cross-Zone + zone-spezifische (scope=zone, zoneId) |
| 8 | Bottom-Panel (optional) | `monitor-layout__bottom` | `dashStore.bottomMonitorPanels` — unter main, L1+L2 |
| 9 | Empty State | `monitor-view__empty` | Wenn keine Sensoren/Aktoren |

### 3.2 Zählungs-Logik (IST, nach Phase 1)

| Stelle | Code |
|--------|------|
| Sektionsüberschrift Sensoren | `Sensoren ({{ zoneSensorCount }})` |
| Sektionsüberschrift Aktoren | `Aktoren ({{ zoneActuatorCount }})` |
| Subzone-Zeile Sensoren | **Kein Count** — nur Subzone-Name + KPIs |
| Subzone-Zeile Aktoren | **Kein Count** — nur Subzone-Name |

**Befund:** Zählung nur in Sektionsüberschrift (Variante A umgesetzt).

### 3.3 Subzone-Darstellung (IST)

- **Accordion:** Ja, `monitor-subzone` mit `toggleSubzone()`, `isSubzoneExpanded()`
- **Subzone-Header sichtbar:** `v-if="zoneSensorGroup.subzones.length > 1 || subzone.subzoneName"` (1542, 1632)
- **"Keine Subzone":** `{{ subzone.subzoneName || 'Keine Subzone' }}` (1558, 1590)
- **Subzone-KPIs:** `getSubzoneKPIs(subzone.sensors)` (1565) — nur bei Sensoren

### 3.4 Level-2 SOLL-IST-Matrix (nach Phase 1)

| Element | IST | SOLL (Auftrag) | Abweichung |
|---------|-----|----------------|------------|
| Zonen-Header | P0, zuerst | P0 | ✓ OK |
| Sensoren (N) | Nach Header | P0 | ✓ OK |
| Aktoren (N) | Nach Sensoren | P0 | ✓ OK |
| Regeln für diese Zone (N) | Nach Aktoren | P1 | ✓ Implementiert 2026-03-06 |
| Zone-Dashboards | Nach Regeln | P1 | ✓ OK |
| Inline-Panels | Am Ende | P1 | ✓ OK |
| Zählung: nur Sektion | Nur Sektionsüberschrift | Variante A | ✓ OK |
| Subzone-Accordion | Vorhanden | Accordion pro Subzone | ✓ OK |
| Doppelte Dashboard-Namen (F004) | getDashboardNameSuffix (createdAt/ID) | Eindeutige Anzeige | ✓ OK |

### 3.5 Level-2-Inventar (Checkliste, nach Phase 1)

- [x] Zonen-Header
- [x] Sensoren (N) mit Subzone-Accordion (vor Zone-Dashboards)
- [x] Aktoren (N) mit Subzone-Accordion
- [x] Regeln für diese Zone (N) — ZoneRulesSection (2026-03-06)
- [x] Zone-Dashboards (nach Sensoren/Aktoren/Regeln)
- [x] Inline-Panels
- [x] Zählung: Subzone-Zeile ohne Count

---

## 4. SOLL-IST-Matrix (konsolidiert)

### Level 1

| # | Element | IST | SOLL | Abweichung |
|---|---------|-----|------|------------|
| 1 | Zonen-Kacheln | Zeilen 1397–1460 | P0, zuerst | ✓ |
| 2 | Aktive Automatisierungen (N) | ActiveAutomationsSection, nach Zonen | P1, nach Zonen | ✓ Implementiert 2026-03-06 |
| 3 | Dashboards (N) | Zeilen 1502–1545, nach Automatisierungen | Nach Zonen | ✓ |
| 4 | Inline-Panels | Zeilen 1548–1554 | Am Ende | ✓ |
| 5 | ESP-Count pro Zone | "X/Y online" im Footer | Optional | ✓ Implementiert |
| 6 | Cross-Zone LinkCards | Chips (kein LinkCard-Design) | LinkCards | ⚠️ G3-L1 |

### Level 2

| # | Element | IST | SOLL | Abweichung |
|---|---------|-----|------|------------|
| 1 | Zonen-Header | Zeilen 1535–1570 | P0 | ✓ |
| 2 | Sensoren (N) | Nach Header | P0 | ✓ OK |
| 3 | Aktoren (N) | Nach Sensoren | P0 | ✓ OK |
| 4 | Regeln für diese Zone (N) | Nach Aktoren | P1 | ✓ Implementiert 2026-03-06 |
| 5 | Zone-Dashboards | Nach Regeln | P1 | ✓ OK |
| 6 | Inline-Panels | Am Ende | P1 | ✓ OK |
| 7 | Zählung | Nur Sektionsüberschrift | Variante A | ✓ Implementiert |
| 8 | Subzone-Accordion | Vorhanden | Accordion | ✓ OK |
| 9 | Doppelte Dashboard-Namen | getDashboardNameSuffix | Eindeutig (F004) | ✓ Implementiert |

---

## 5. Priorisierte Verbesserungsliste

| # | Ebene | Änderung | Status |
|---|-------|----------|--------|
| 1 | L2 | Reihenfolge: Zone-Dashboards unter Sensoren/Aktoren | ✓ Erledigt |
| 2 | L2 | Zählung: Subzone-Zeile ohne Count | ✓ Erledigt |
| 3 | L1 | Reihenfolge: L1 war bereits korrekt | — |
| 4 | L2 | Subzone-Accordion | ✓ Bereits umgesetzt |
| 5 | L1 | ESP-Count pro Zone ("X/Y online") | ✓ Erledigt |
| 6 | L1 | Cross-Zone-Dashboards als LinkCards | Offen (niedrig) |
| 7 | L2 | Doppelte Dashboard-Namen (F004): getDashboardNameSuffix | ✓ Erledigt |
| 8 | L1/L2 | 40px Trennung (--space-10) | ✓ Erledigt |
| 9 | L2 | Regeln für diese Zone (ZoneRulesSection) | ✓ Erledigt 2026-03-06 |
| 10 | L1 | Aktive Automatisierungen (ActiveAutomationsSection) | ✓ Erledigt 2026-03-06 |

---

## 6. Regel für Zählung und "Keine Subzone"

### Zählung (einheitliche Regel)

**Variante A (empfohlen):**
- Sektionsüberschrift: `Sensoren ({{ zoneSensorCount }})` / `Aktoren ({{ zoneActuatorCount }})`
- Subzone-Zeile: **Kein** Count, nur Subzone-Name + Status/KPIs

**Variante B (Alternative):**
- Sektionsüberschrift: `Sensoren` / `Aktoren` (ohne Zahl)
- Subzone-Zeile: Count nur hier (Teilsumme pro Subzone)

**Auftrag-layout empfiehlt Variante A.** Subzone-Count in Zeile 1566/1597 entfernen oder nur bei `subzones.length > 1` als Teilsumme anzeigen.

### "Keine Subzone"

- **IST:** `{{ subzone.subzoneName || 'Keine Subzone' }}` — erscheint immer wenn Subzone keinen Namen hat
- **SOLL:** Nur anzeigen, wenn tatsächlich Geräte ohne Subzone-Zuordnung existieren (`!subzone.subzoneId`)
- **Hinweis:** Bei `subzoneId === null` und Geräten in dieser Gruppe ist "Keine Subzone" semantisch korrekt. Optional: nur rendern wenn `subzones.some(sz => !sz.subzoneId)`.

---

## 7. Screenshot-Mapping (Code → sichtbares Element)

| Sichtbares Element | Code-Zeile | Klasse/Element |
|-------------------|------------|----------------|
| "X Zonen · Y/Z Sensoren online · N Alarme" | 1377–1387 | `monitor-l1-header__summary` |
| Zone-Kachel "Gewächshaus" | 1399–1459 | `monitor-zone-tile` |
| Status-Ampel (grün/gelb/rot) | 1408–1413 | `monitor-zone-tile__status` |
| Temp-Range, Feuchte-Range | 1422–1431 | `monitor-zone-tile__kpis` |
| "X/Y online · X/Y Sensoren · Z Aktoren" | `monitor-zone-tile__footer` | Footer mit ESP-Count |
| "Aktive Automatisierungen (N)" Sektion | 1498–1500 | `ActiveAutomationsSection`, `monitor-section` |
| "Dashboards (N)" Karte | 1504–1514 | `monitor-dashboard-card__header` |
| Dashboard-Chips | 1477–1490 | `monitor-dashboard-chip` |
| "Zone-Dashboards" Überschrift (L2) | 1579 | `monitor-section__title` |
| "Sensoren (N)" Überschrift (L2) | 1618 | `monitor-section__title` |
| Subzone-Zeile "Keine Subzone" (ohne Count) | `monitor-subzone__header` | Nur Name + KPIs |
| SensorCard-Grid | 1591–1646 | `monitor-card-grid` |
| "Aktoren (N)" Überschrift (L2) | 1772 | `monitor-section__title` |

---

## 8. Duplikations-Vermeidung (L1 ↔ L2)

| Inhalt | Level 1 | Level 2 | Regel |
|--------|---------|---------|-------|
| Zonen-Status | Aggregiert (Kachel) | Nicht nötig (bereits in Zone) | ✓ Keine Duplikation |
| Sensor-Werte | Nur aggregiert (Range) | Einzelwerte pro Sensor | ✓ Korrekt getrennt |
| Dashboard-Liste | Cross-Zone (alle) | Zone-spezifisch | ✓ Korrekt getrennt |
| Zählung | Zone-KPIs (Sensor/Aktor-Count) | Sektionsüberschrift (N) | ✓ Subzone-Zeile ohne Count |

---

## 9. Akzeptanzkriterien (Auftrag)

- [x] Level 1 und Level 2 vollständig getrennt dokumentiert
- [x] Für jede Ebene: exaktes Inventar (was wird angezeigt, wo im Code)
- [x] SOLL-IST-Matrix für beide Ebenen
- [x] Keine Duplikation zwischen L1 und L2 in der Dokumentation
- [x] Priorisierte Verbesserungsliste mit konkreten Zeilen/Dateien
- [x] Regel für Zählung und "Keine Subzone" festgelegt

---

## 10. Referenzen

| Dokument | Inhalt |
|----------|--------|
| `auftrag-monitor-l2-layout-ux-analyse.md` | Layout-Varianten A–D |
| `auftrag-layout-monitor-seite-ueberschriften-reihenfolge.md` | Reihenfolge, Zählung (Erledigt-Status teilweise veraltet) |
| `auftrag-monitor-l2-optimiertes-design-implementierung.md` | L2 Implementierungsauftrag |
| `auftrag-monitor-komponentenlayout-erstanalyse.md` | IST-Zustand MonitorView, SensorsView |
| `trockentest-bericht-layout-zonen-komponenten-2026-03-03.md` | F004 doppelte Dashboard-Namen |

---

*Report erstellt durch Layout-Analyse gemäß Auftrag. Keine Code-Änderungen vorgenommen.*
