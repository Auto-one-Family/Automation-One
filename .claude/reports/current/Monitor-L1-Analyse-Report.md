# Monitor L1 Analyse-Report

> **Erstellt:** 2026-03-10
> **Typ:** Tiefenanalyse (kein Code geaendert)
> **Scope:** MonitorView.vue L1 — Zonenuebersicht (`/monitor` ohne Parameter)
> **Quellen:** MonitorView.vue (3832 Zeilen), ActiveAutomationsSection.vue, RuleCardCompact.vue, InlineDashboardPanel.vue, zone.store.ts, esp.ts, zones.ts API, dashboard.store.ts, HardwareView.vue

---

## 1. Komponentenbaum (mit Dateipfaden)

```
MonitorView.vue (/monitor, L1-Block: Zeilen 1692–1891)
├── Ready-Gate
│   ├── BaseSkeleton (v-if="espStore.isLoading", Text: "Lade Zonen...")
│   └── ErrorState (v-else-if="espStore.error", @retry → espStore.fetchAll())
├── L1 Header (Zeilen 1704–1717)
│   └── Titel "Zonenuebersicht" + Zone-Count-Badge
├── Zone-Filter (Zeilen 1720–1749, native <select>)
│   ├── <option null> "Alle Zonen"
│   ├── v-for zoneStore.activeZones
│   └── <optgroup "Archiv"> v-for zoneStore.archivedZones
├── Archived Zone Banner (Zeile 1752–1755, v-if="isArchivedZoneSelected")
├── Empty State (Zeilen 1758–1764, v-if="zoneKPIs.length === 0")
│   └── router-link to="/hardware" "Zonen in der Hardware-Ansicht erstellen"
├── Zone-Tiles Grid (Zeilen 1767–1832, v-if="zoneKPIs.length > 0")
│   └── <button> pro Zone (INLINE, keine eigene Komponente)
│       ├── Header: Zone-Name + Health-Status-Badge (Icon + Label)
│       ├── Health-Reason (nur bei warning/alarm)
│       ├── KPI-Bereich: aggregateZoneSensors() → formatAggregatedValue()
│       └── Footer: ESP-Online-Count, Sensor-Count, Aktor-Count, lastActivity
├── ActiveAutomationsSection.vue (Zeile 1835)
│   └── components/monitor/ActiveAutomationsSection.vue (224 Zeilen)
│       └── RuleCardCompact.vue[] (max 5, aus components/logic/)
│           └── 292 Zeilen, Props: rule, isActive?, zoneNames?
├── Dashboard Overview Card (Zeilen 1838–1881, v-if crossZoneDashboards > 0)
│   └── Chips pro Dashboard + Edit/View Links
└── InlineDashboardPanel.vue[] (Zeilen 1884–1889)
    └── v-for dashStore.inlineMonitorPanels, mode="inline"
```

### Komponenten-Inventar

| Komponente | Dateipfad | Zeilen | Eigene Komponente? | Stores |
|---|---|---|---|---|
| Zone-Tile | MonitorView.vue:1767–1832 | ~65 | **Nein** (inline) | espStore (indirekt via zoneKPIs) |
| Zone-Filter | MonitorView.vue:1720–1749 | ~30 | **Nein** (inline `<select>`) | zoneStore.activeZones/archivedZones |
| ActiveAutomationsSection | components/monitor/ActiveAutomationsSection.vue | 224 | Ja | logicStore |
| RuleCardCompact | components/logic/RuleCardCompact.vue | 292 | Ja | router |
| InlineDashboardPanel | components/dashboard/InlineDashboardPanel.vue | 241 | Ja | dashStore |
| BaseSkeleton | shared/design/primitives/BaseSkeleton.vue | — | Ja (Primitive) | — |
| ErrorState | shared/design/patterns/ErrorState.vue | — | Ja (Pattern) | — |

**Keine eigene Zone-Tile-Komponente.** Die gesamte Tile-Logik (65 Zeilen Template + ~200 Zeilen CSS) lebt direkt in MonitorView.vue.

---

## 2. Zone-Tile Anatomie (mit Code-Referenzen)

### Struktur

```html
<button class="monitor-zone-tile monitor-zone-tile--{healthStatus}"
        @click="goToZone(zone.zoneId)">
```

| Bereich | Inhalt | Quelle | Zeilen |
|---|---|---|---|
| **Header** | Zone-Name + Status-Badge (Icon + Label) | `zone.zoneName`, `HEALTH_STATUS_CONFIG[zone.healthStatus]` | 1770–1785 |
| **Health-Reason** | Menschenlesbarer Grund (nur warning/alarm) | `zone.healthReason` | 1787–1789 |
| **KPI-Bereich** | Aggregierte Sensorwerte pro Typ | `zone.aggregation.sensorTypes[]` → `formatAggregatedValue()` | 1791–1803 |
| **KPI-Empty** | "Keine Sensordaten" | `v-else` wenn keine sensorTypes | 1805–1807 |
| **Footer Counts** | "{online}/{total} online", "{active}/{count} Sensoren", "N Aktoren [· N aktiv]" | KPI-Felder direkt | 1809–1822 |
| **Footer Activity** | Clock-Icon + `formatRelativeTime(lastActivity)` | `zone.lastActivity`, `.--stale` Klasse | 1824–1829 |

### Health-Status Icons

| Status | Icon | Farbe (left-border) | Label |
|---|---|---|---|
| `ok` | CheckCircle2 | `var(--color-success)` | "Alles OK" |
| `warning` | AlertTriangle | `var(--color-warning)` | "Warnung" |
| `alarm` | XCircle | `var(--color-error)` | "Alarm" |
| `empty` | Minus | dashed, opacity 0.7 | "Leer" |

### Health-Status-Berechnung (`getZoneHealthStatus()`, Zeilen 947–977)

```
totalDevices === 0                            → 'empty'
onlineDevices === 0 (aber Geraete vorhanden)  → 'alarm'  "Alle N Geraete offline"
sensorCount > 0 && activeSensors === 0        → 'alarm'  "Keine Sensoren aktiv"
offlineDevices > 0 || alarmCount > 0 || ...   → 'warning' (mit Reasons-Array)
sonst                                         → 'ok'
```

### KPI-Aggregation

`computeZoneKPIs()` (Zeilen 986–1082) — **lokale Funktion**, kein Computed:

1. `groupDevicesByZone(espStore.devices)` gruppiert ESPs nach `zone_id`
2. Pro Gruppe: Zaehlung von sensors, actuators, quality-basierte activeSensors/alarmCount
3. `aggregateZoneSensors(group.devices)` aus `sensorDefaults.ts` — aggregiert nach Kategorie, max 3 Typen + `extraTypeCount`
4. `getESPStatus()` pro Device fuer online-Count
5. Leere Zonen aus `allZones` API werden als `healthStatus: 'empty'` angehaengt

**Performance:** Kein Computed, sondern `ref<ZoneKPI[]>` mit debounced Watch (300ms). Neuberechnung bei jeder Aenderung an `espStore.devices` (deep watch). Bei 100+ Sensoren koennte das merkbar werden.

### Shared Devices auf L1

**Multi-Zone-Devices:** Werden NUR in der Heimzone gezaehlt. `groupDevicesByZone()` gruppiert nach `device.zone_id` — dem einzelnen Feld. `assigned_zones` wird in L1 NICHT ausgewertet.

**Mobile Sensoren:** Werden in der Heimzone gezaehlt, NICHT in der `active_context`-Zone. Ein mobiler pH-Sensor mit `zone_id = A` und `active_zone_id = B` erscheint im Tile von Zone A.

### Stale-Erkennung

`isZoneStale()` (Zeilen 1105–1112):
- Nutzt `ZONE_STALE_THRESHOLD_MS` (60s, aus `formatters.ts`)
- `lastActivity` = Max aller `sensor.last_read` / `last_reading_at`, Fallback `device.last_seen` / `last_heartbeat`
- Stale: CSS `.monitor-zone-tile__activity--stale` → `color: var(--color-warning)`
- Normal: `color: var(--color-text-muted)`

### CSS-Details

```css
.monitor-zone-grid {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}
/* @media (max-width: 639px) → 1fr (eine Spalte) */

.monitor-zone-tile {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  border-left: 3px solid;  /* Farbe via Health-Status */
  padding: var(--space-4);
}
/* Hover: translateY(-2px), box-shadow 0 4px 16px */

/* KPI-Value: font-family: var(--font-mono), font-size: var(--text-lg), font-weight: 700 */
/* KPI-Label: font-size: 10px (HARDCODED), text-transform: uppercase */
/* Activity: font-size: 10px (HARDCODED) */
```

**Hardcodierte Werte:** `font-size: 10px` in KPI-Label und Activity-Timestamp — kein Design-Token.

---

## 3. Datenfluss-Diagramm

```
                          onMounted() — parallel, NICHT awaited
                          ┌─────────────────────────────────────┐
                          │                                     │
          [A] espStore.fetchAll()       [B] fetchAllZones()     [C] zoneStore.fetchZoneEntities()
              (Guard: leer)                 (IMMER)                  (Guard: leer)
              │                             │                        │
              ▼                             ▼                        ▼
         GET /esp/devices            GET /zone/zones            GET /zones
              │                             │                        │
              ▼                             ▼                        ▼
         espStore.devices[]           allZones: ref[]          zoneStore.zoneEntities[]
              │                             │                        │
              │  watch(deep, 300ms)         │  watch(immediate)      │
              └─────────────┬───────────────┘                        │
                            ▼                                        │
                  computeZoneKPIs()                                  │
                  ├─ groupDevicesByZone(devices)                     │
                  ├─ aggregateZoneSensors() pro Zone                 │
                  ├─ getZoneHealthStatus() pro Zone                  │
                  └─ merge leere Zonen aus allZones                  │
                            │                                        │
                            ▼                                        ▼
                  zoneKPIs: ref<ZoneKPI[]>              activeZones/archivedZones
                            │                           (Filter-Dropdown-Optionen)
                            ▼
                  filteredZoneKPIs (computed)
                  ← selectedZoneFilter ref
                            │
                            ▼
                       Template: v-for Zone-Tiles


Live-Updates:
  WS sensor_data/esp_health → espStore.devices[] mutiert in-place
                            → watch(deep, 300ms debounce)
                            → computeZoneKPIs()
                            → zoneKPIs.value neu gesetzt
                            → Template re-rendert
```

### Race Condition

`espStore.fetchAll()` und `fetchAllZones()` laufen parallel ohne `await`. Moegliche kurze Inkonsistenz:
- `allZones` kommt zuerst → nur leere Tiles (fuer ~100ms)
- `devices` kommt zuerst → Tiles ohne leere Zonen (fuer ~100ms)
- Beide da → vollstaendig

**Keine echte Gefahr** — maximal 2 Render-Durchlaeufe, konvergiert.

### Kritisch: `fetchAllZones()` hat keinen Guard

`espStore.fetchAll()` wird mit `if (devices.length === 0)` geschuetzt. `fetchAllZones()` wird **immer** aufgerufen — auch wenn Daten bereits vorhanden. Bei Navigation zwischen L1 und L2 (keep-alive) wird bei jeder Aktivierung neu gefetcht.

---

## 4. "Aktive Automatisierungen" Analyse

### Datenquelle

`ActiveAutomationsSection.vue` (224 Zeilen, `components/monitor/`):
- Store: `useLogicStore()` → `logicStore.enabledRules`
- `onMounted`: `logicStore.fetchRules()` nur wenn `rules.length === 0`
- Kein eigener API-Call — nutzt Store-Cache

### Definition "aktiv"

`enabledRules` = `rules[].filter(r => r.enabled)` — NUR `enabled`-Flag, nicht `isRunning`. Fehler-Regeln (`last_execution_success === false`) werden ZUERST sortiert (Fehler sichtbar machen).

### Sortierung

```
1. Fehler zuerst (last_execution_success === false)
2. Priority (niedrigere Zahl = hoeher)
3. Name (alphabetisch)
```
Maximal 5 Regeln angezeigt. Footer-Link "Alle N Regeln anzeigen" → `/logic`.

### Vertikaler Platz

| Regeln | Verhalten | Geschaetzte Hoehe |
|---|---|---|
| 0 | Empty State: Zap-Icon + Text + Button "Zum Regeln-Tab" | ~120px |
| 1 | 1 RuleCardCompact | ~80px |
| 5 | 5 RuleCardCompact (CSS Grid, auto-fill minmax(200px)) + "Alle Regeln"-Link | ~200px |
| 10 | 5 RuleCardCompact + "Alle 10 Regeln anzeigen"-Link | ~200px (gedeckelt) |

### Immer sichtbar

Ja — `<ActiveAutomationsSection />` wird **immer** gerendert (Zeile 1835, kein `v-if`). Auch bei aktivem Zone-Filter.

### Zone-Badge auf L1

`RuleCardCompact` bekommt `:zone-names="logicStore.getZonesForRule(rule)"` — zeigt "Zone A, Zone B" oder "Zone A +2" bei >2 Zonen. Beantwortet die "Wo?"-Frage (5-Sekunden-Regel).

---

## 5. Vergleich Uebersicht-Tab vs Monitor L1

### Wichtige Erkenntnis: DashboardView existiert nicht mehr

Die Route `/` leitet auf `/hardware` um. Der **"Uebersicht"-Tab in ViewTabBar zeigt HardwareView**, nicht eine separate DashboardView. Der Vergleich ist also **HardwareView L1 vs. MonitorView L1**.

### Strukturvergleich

| Dimension | HardwareView (Uebersicht) | MonitorView L1 |
|---|---|---|
| **Primaerfokus** | ESP-Geraete-Topologie, Drag-Drop | Sensor-Datenstatus, KPIs |
| **Zone-Visualisierung** | Accordion-Liste (ZonePlate.vue) | CSS Grid mit Tiles (inline) |
| **Datenebene** | ESPDevice-Objekte mit Sensors/Actuators | Aggregierte Zone-KPIs |
| **Interaktion** | Manage (DnD, Rename, Delete, Config) | Observe (Click → L2 Drill-Down) |
| **Sensor-Messwerte** | Nur in ZonePlate-Header (aggregiert) | Prominent in Tile-KPI-Bereich |
| **Health-Status** | Implizit via ESP-Status-Farben | Explizit (ok/warning/alarm/empty) |
| **Geraete-Management** | Ja (Drag-Drop, Pending-Panel) | Nein (read-only) |
| **Empty Zones** | Ja (aus zoneStore.activeZones) | Ja (aus zonesApi.getAllZones()) |

### Geteilte Komponenten

| Komponente | HardwareView | MonitorView L1 |
|---|---|---|
| ViewTabBar | Ja | Ja |
| BaseSkeleton | Ja | Ja |
| InlineDashboardPanel | Ja | Ja |
| ZonePlate | Ja (Hauptelement) | **Nein** |
| Zone-Tile (inline) | **Nein** | Ja |
| SensorCard / ActuatorCard | Nein (DeviceMiniCard) | Nein (erst in L2) |

**Keine geteilte Zone-Card-Komponente.** ZonePlate (Accordion) und Zone-Tile (Button) sind komplett unterschiedliche Implementierungen.

### Design-Token-Vergleich

| Eigenschaft | HardwareView/ZonePlate | MonitorView/Zone-Tile |
|---|---|---|
| Background | `var(--glass-bg)` + iridescent top-border | `var(--color-bg-tertiary)` + 3px left-border |
| Border | `var(--glass-border)` | `var(--glass-border)` (identisch) |
| Border-Radius | `var(--radius-md)` | `var(--radius-md)` (identisch) |
| Status-Signal | Iridescent top-border + Badge | 3px farbiger left-border |
| Padding | ZonePlate-eigenes Padding | `var(--space-4)` |
| Container-Gap | `var(--space-4)` | `var(--space-4)` (identisch) |
| Root-Gap | `var(--space-3)` | `var(--space-4)` (leicht unterschiedlich) |

### Kritische Divergenz: Health-Status-Berechnung

HardwareView bewertet Zone-Gesundheit anhand **ESP-Status** (online/offline/error/safemode). MonitorView nutzt eine erweiterte Logik mit **Sensor-Quality** (activeSensors, alarmCount, emergencyStoppedCount).

**Moeglich:** Zone in HardwareView gruen (alle ESPs online) aber in MonitorView gelb (Sensoren fehlerhaft). `getZoneHealthStatus()` existiert NUR in MonitorView — keine geteilte Funktion.

---

## 6. Use-Case-Bewertung (5 Szenarien)

### UC-1: Gewaechshaus-Betreiber (3 Zonen, 15 Sensoren, 5 Aktoren)

| Kriterium | Bewertung | Detail |
|---|---|---|
| 5-Sekunden-Regel | **Gut** | 3 Tiles mit Health-Status-Badge (ok/warning/alarm) — sofort erkennbar |
| KPI-Aussagekraft | **Gut** | Aggregierte Werte (Temp 22.5°C, Humidity 65%RH) — max 3 Typen sichtbar |
| Alarm-Sichtbarkeit | **Mittel** | `alarmCount` zaehlt in Footer, aber keine Severity-Unterscheidung |
| Navigation zu Detail | **Gut** | Click auf Tile → L2 mit Subzone-Accordion |

### UC-2: Forscher mit mobilem Messgeraet (1 mobiler pH-Sensor, 4 Zonen)

| Kriterium | Bewertung | Detail |
|---|---|---|
| Active Context sichtbar | **Schlecht** | Mobiler Sensor erscheint NUR in Heimzone (zone_id), nicht in active_context-Zone |
| Zone-Wechsel | **Nicht moeglich** | Kein Quick-Switch auf L1 — muss ueber Hardware-View oder Config-Panel |
| Scope-Badge | **Nicht vorhanden** | Kein "Mobil"-Badge auf L1-Tiles |

**Groesste Luecke:** Ein mobiler pH-Sensor der in Zone B misst, wird im Tile von Zone A angezeigt (Heimzone). Zone B zeigt den Wert gar nicht.

### UC-3: Fertigation-Setup (1 Technikzone + 3 Pflanzen-Zonen)

| Kriterium | Bewertung | Detail |
|---|---|---|
| Technikzone-Tile | **Ja** | Eigenes Tile mit Pumpe + pH/EC-Sensoren |
| Cross-Zone-Werte | **Nein** | Pflanzen-Zone-Tiles zeigen NICHT den EC/pH der Technikzone |
| Multi-Zone-Badge | **Nicht vorhanden** | Shared-Device zaehlt nur in Heimzone |

**Luecke:** Fertigation-Use-Case braucht Cross-Zone-KPIs ("EC der Naehrloesung" auf allen Pflanzen-Zonen sichtbar). Aktuell nicht abgebildet.

### UC-4: Kleines Setup (1 Zone, 2 Sensoren, kein Aktor)

| Kriterium | Bewertung | Detail |
|---|---|---|
| Layout bei 1 Zone | **Akzeptabel** | Eine Tile nimmt `minmax(280px, 1fr)` — bis 639px volle Breite, darueber maximal 50% |
| Aktor-Count | **Neutral** | Footer zeigt "0 Aktoren" — nicht stoerend |
| Empty State | **Gut** | Wenn 0 Zonen: CTA-Link "Zonen in der Hardware-Ansicht erstellen" |

**Optimierung moeglich:** Bei nur 1 Zone koennte direkt L2 angezeigt werden (automatischer Drill-Down).

### UC-5: Wissenschaftliches Projekt (6 Zonen, nur Sensoren, mobile Sensoren)

| Kriterium | Bewertung | Detail |
|---|---|---|
| 6 Tiles | **Gut** | Grid mit 2-3 Spalten, alle sichtbar ohne Scrollen |
| Reine Sensor-Setups | **Gut** | KPIs zeigen aggregierte Sensorwerte, Aktor-Count 0 ist nicht stoerend |
| Mobile Sensoren | **Schlecht** | Werden in Heimzone gezaehlt, nicht in active_context-Zone |
| Sensor-Count-Accuracy | **Mittel** | `sensorCount` = alle Sensoren (inkl. stale), `activeSensors` = quality-filtered |

---

## 7. Aenderungsbedarf (kategorisiert)

### Entfernen

| Element | Grund | Impact |
|---|---|---|
| — | Aktuell nichts ueberfluesiges identifiziert | — |

### Vereinfachen

| Element | Was | Impact |
|---|---|---|
| `computeZoneKPIs()` | Ref + debounced Watch → koennte Computed sein | Weniger Code, reaktiver |
| `fetchAllZones()` ohne Guard | Wird bei jedem Mount aufgerufen, auch wenn Daten vorhanden | Unnoetige Requests bei keep-alive Navigation |
| KPI-Label `font-size: 10px` | Hardcoded statt Token | 2 Stellen → `var(--text-xs)` |

### Ergaenzen

| Element | Was fehlt | Use-Case | Prioritaet |
|---|---|---|---|
| **Mobile-Device-Kontext** | Sensor in active_context-Zone anzeigen, nicht nur Heimzone | UC-2, UC-5 | **Hoch** |
| **Cross-Zone-KPIs** | Shared-Device-Werte in allen zugewiesenen Zonen anzeigen | UC-3 | **Mittel** |
| **Scope-Badge auf Tile** | "N mobile" / "N shared" Indikator im Footer | UC-2, UC-3 | **Mittel** |
| **Zone-Tile als eigene Komponente** | 65 Zeilen Template + 200 Zeilen CSS extrahieren | Wartbarkeit | **Mittel** |
| **Auto-Drill-Down bei 1 Zone** | Direkt L2 anzeigen wenn nur 1 Zone | UC-4 | **Niedrig** |
| **Severity-Badge** | Alarm-Count mit Severity (critical/warning/info) | UC-1 | **Niedrig** |

### Angleichen

| Element | HardwareView | MonitorView | Aenderung |
|---|---|---|---|
| Health-Status-Logik | Implizit (ESP-Status) | Explizit (`getZoneHealthStatus`) | **Shared Funktion** in utils extrahieren |
| Zone-Background | `var(--glass-bg)` | `var(--color-bg-tertiary)` | Angleichen an glass-panel |
| Root-Gap | `var(--space-3)` | `var(--space-4)` | Vereinheitlichen |
| Status-Signal | Iridescent top-border | 3px farbiger left-border | Design-Entscheidung treffen (eine Sprache) |

---

## 8. Abhaengigkeiten L1 <-> L2 <-> Editor

### Route-Parameter L1 → L2

```typescript
// L1 → L2: Click auf Zone-Tile
goToZone(zoneId: string) {
  router.push({ name: 'monitor-zone', params: { zoneId } })
}
// zoneId wird als Route-Param uebergeben
// L2 liest: route.params.zoneId → selectedZoneId
```

### Shared Stores

| Store | L1 | L2 | Editor | Bemerkung |
|---|---|---|---|---|
| `espStore` | devices[] fuer KPIs | Nein (API primaer) | Nein | L2 nutzt `getZoneMonitorData()` statt espStore |
| `zoneStore` | Filter-Dropdown | Nein | Nein | Nur fuer ZoneEntity-Filter |
| `logicStore` | enabledRules, getZonesForRule | getRulesForZone, getRulesForActuator | Nein | Shared logic |
| `dashStore` | crossZoneDashboards, inlineMonitorPanels | inlineMonitorPanelsL2, breadcrumb | layouts[], Widgets, Templates | Zentral fuer alle 3 |

### Shared Components

| Komponente | L1 | L2 | Editor |
|---|---|---|---|
| ViewTabBar | Tab-Navigation | Tab-Navigation | Tab-Navigation |
| InlineDashboardPanel | Cross-Zone-Panels | Zone-spezifische Panels | — |
| SensorCard | **Nein** | Ja (monitor-mode) | Nein (Widget-Version) |
| ActuatorCard | **Nein** | Ja (monitor-mode) | Nein (Widget-Version) |
| RuleCardCompact | ActiveAutomationsSection | ZoneRulesSection | Nein |
| BaseSkeleton | Ready-Gate | Ready-Gate | — |

### API-Calls die L1 und L2 teilen

| API-Call | L1 | L2 |
|---|---|---|
| `espStore.fetchAll()` | Ja (onMounted) | Nein (eigener API-Call) |
| `zonesApi.getAllZones()` | Ja (fuer leere Zonen) | Nein |
| `zonesApi.getZoneMonitorData()` | Nein | Ja (primaer) |
| `logicStore.fetchRules()` | Ja | Ja (via Store-Cache) |
| `zoneStore.fetchZoneEntities()` | Ja (fuer Filter) | Nein |

### Design-Tokens die geteilt werden

| Token | L1 | L2 | Editor |
|---|---|---|---|
| `--glass-border` | Tile-Border | Card-Border | Widget-Border |
| `--radius-md` | Tile-Radius | Card-Radius | Widget-Radius |
| `--space-4` | Grid-Gap | Section-Gap | Widget-Gap |
| `--space-10` | Section-Trennung | Section-Trennung | — |
| `--color-success/warning/error` | Health-Status | Quality-Status | Alert-Widgets |
| `--font-mono` | KPI-Werte | Sensor-Werte | Chart-Achsen |

### InlineDashboardPanel Scoping

```
L1: dashStore.inlineMonitorPanels        → scope !== 'zone' (Cross-Zone)
L2: dashStore.inlineMonitorPanelsL2      → Cross-Zone + zone-spezifische (scope='zone', zoneId)
```

Beide nutzen `InlineDashboardPanel` mit `mode="inline"`, aber verschiedene Panel-Sets.

---

## 9. Offene Fragen

1. **Soll die Zone-Tile eine eigene Komponente werden?** — 65 Zeilen Template + ~200 Zeilen CSS inline in einer 3832-Zeilen-Datei. Extrahierung wuerde MonitorView entschlacken und Testing ermoeglichen.

2. **Wie sollen Mobile/Shared Devices auf L1 dargestellt werden?** — Aktuell nur in Heimzone. Optionen:
   - A) Sensor auch in active_context-Zone zaehlen (Doppelzaehlung)
   - B) Eigene "Mobile Sensoren"-Sektion unter den Tiles
   - C) Badge "1 mobiler Sensor aktiv" im Tile der Ziel-Zone

3. **Cross-Zone-KPIs: Backend-Support vorhanden?** — `assigned_zones` existiert auf sensor_configs, aber `computeZoneKPIs()` wertet es nicht aus. Braucht das nur Frontend-Logik oder auch eine neue API?

4. **Health-Status-Berechnung teilen?** — `getZoneHealthStatus()` existiert nur in MonitorView. ZonePlate hat eine implizite Statuslogik. Soll eine shared `computeZoneHealth()` Funktion extrahiert werden?

5. **`computeZoneKPIs()` als ref vs. computed?** — Aktuell manuell via debounced Watch. Performance-Messungen bei >50 Sensoren wuerde zeigen ob Debounce noetig ist oder ob computed reicht.

6. **`fetchAllZones()` Guard hinzufuegen?** — Wird bei jedem Mount aufgerufen. Bei keep-alive und Tab-Wechsel ist das ein unnoetige API-Call. Guard wie bei `espStore.fetchAll()` wuerde reichen.

7. **KPI-Label `font-size: 10px`** — Soll das ein Design-Token werden (`var(--text-2xs)` o.ae.)?

---

## Zusammenfassung

Monitor L1 ist **funktional solide** fuer den Standard-Use-Case (UC-1). Die groessten Luecken betreffen **Mobile/Shared Devices** (UC-2, UC-3, UC-5), die auf L1 nicht korrekt abgebildet werden. Die Zone-Tile ist **inline** implementiert und sollte fuer Wartbarkeit extrahiert werden. Der Datenfluss ist **klar aber redundant** (3 parallele API-Calls, `fetchAllZones` ohne Guard). Die Health-Status-Logik ist **nicht geteilt** mit HardwareView — eine Vereinheitlichung wuerde Inkonsistenzen vermeiden.
