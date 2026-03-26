# Analyse A1 — Zone-Tile Extraktion + Fusionskonzept

> **Erstellt:** 2026-03-25
> **Typ:** Reine Analyse — KEIN Code geaendert
> **Datei-Stand:** MonitorView.vue ~4006 Zeilen

---

## 1. Zone-Tile Anatomie

Die Zone-Tile ist ein `<button>` Element innerhalb eines `v-for` ueber `filteredZoneKPIs`.

**Template-Block:** [MonitorView.vue:1888-1954](El Frontend/src/views/MonitorView.vue#L1888-L1954) (67 Zeilen Template)
**CSS-Block:** [MonitorView.vue:2832-3038](El Frontend/src/views/MonitorView.vue#L2832-L3038) (207 Zeilen CSS)

### Elemente im Detail

| # | Element | Datenquelle | Computed/Ref | Template-Zeile | CSS-Klasse |
|---|---------|-------------|--------------|----------------|------------|
| 1 | **Zone-Name** | `zone.zoneName` | aus `computeZoneKPIs()` → `groupDevicesByZone()` → `zoneName` | 1896 | `.monitor-zone-tile__name` |
| 2 | **Health-Status-Badge** | `zone.healthStatus` + `HEALTH_STATUS_CONFIG` | aus `getZoneHealthStatus()` | 1897-1903 | `.monitor-zone-tile__status` + `.zone-status--{ok/warning/alarm/empty}` |
| 3 | **Health-Reason** | `zone.healthReason` | aus `getZoneHealthStatus()` (nur bei warning/alarm) | 1906-1908 | `.monitor-zone-tile__reason` |
| 4 | **KPI-Werte** | `zone.aggregation.sensorTypes[]` | `aggregateZoneSensors()` aus `sensorDefaults.ts` | 1911-1921 | `.monitor-zone-tile__kpis`, `__kpi`, `__kpi-label`, `__kpi-value` |
| 5 | **KPI-Empty** | Fallback wenn keine Sensordaten | — | 1923-1925 | `.monitor-zone-tile__kpis-empty` |
| 6 | **ESP-Online-Count** | `zone.onlineDevices / zone.totalDevices` | aus `computeZoneKPIs()` | 1930-1931 | `.monitor-zone-tile__count` |
| 7 | **Sensor-Count** | `zone.activeSensors / zone.sensorCount` | aus `computeZoneKPIs()` | 1933-1938 | `.monitor-zone-tile__count` + `--ok/--warn/--alarm` |
| 8 | **Aktor-Count** | `zone.actuatorCount / zone.activeActuators` | aus `computeZoneKPIs()` | 1940-1943 | `.monitor-zone-tile__count` + `--ok` |
| 9 | **Mobile-Guest-Count** | `zone.mobileGuestCount` | aus `computeZoneKPIs()` + `deviceContextStore` | 1945-1947 | `.monitor-zone-tile__count--mobile` |
| 10 | **Last-Activity** | `zone.lastActivity` | aus `computeZoneKPIs()` via `formatRelativeTime()` | 1949-1952 | `.monitor-zone-tile__activity` + `--stale` |

### Event-Handler

| Event | Handler | Zeile |
|-------|---------|-------|
| `@click` | `goToZone(zone.zoneId)` → `router.push({ name: 'monitor-zone', params: { zoneId } })` | 1892 |
| *(kein `@keydown`)* | Button-Element hat implizites Enter/Space | — |

### Dynamische CSS-Klassen

| Klasse | Bedingung | Zeile |
|--------|-----------|-------|
| `monitor-zone-tile--{healthStatus}` | `ok`, `warning`, `alarm`, `empty` | 1891 |
| `monitor-zone-tile__count--ok` | `activeSensors === sensorCount && sensorCount > 0` | 1934 |
| `monitor-zone-tile__count--warn` | `activeSensors < sensorCount && activeSensors > 0` | 1935 |
| `monitor-zone-tile__count--alarm` | `sensorCount > 0 && activeSensors === 0` | 1936 |
| `monitor-zone-tile__activity--stale` | `isZoneStale(zone.lastActivity)` (>60s) | 1949 |

### Hardcodierte Werte im CSS

- **Keine hardcodierten `font-size: 10px`** — alle Werte nutzen Design-Tokens (`var(--text-xs)`, `var(--text-base)`, `var(--text-lg)`)
- `gap: 4px` in `.monitor-zone-tile__status` (Zeile 2910) — sollte `var(--space-1)` sein
- `gap: 1px` in `.monitor-zone-tile__kpi` (Zeile 2965) — minimal, koennte Token nutzen
- `gap: 3px` in `.monitor-zone-tile__activity` (Zeile 3030) — nicht auf 4px-Grid

---

## 2. Datenfluss-Diagramm

```
espStore.devices (WS: sensor_data, esp_health)
       │
       ▼ (watch, deep: true, debounce 300ms)
computeZoneKPIs()  ─────────────────────────────────────────┐
       │                                                     │
       ├── groupDevicesByZone(espStore.devices)              │
       │      → Array<{ zoneId, zoneName, devices[] }>       │
       │                                                     │
       ├── [Mobile-Sensor-Pass]                              │
       │      deviceContextStore.getActiveZoneId(config_id)  │
       │      → mobileGuestCounts Map, mobileSensorsAwayFromHome Map
       │                                                     │
       ├── [Per Zone] aggregateZoneSensors(group.devices)    │
       │      → ZoneAggregation { sensorTypes[max 3], ... }  │
       │                                                     │
       ├── [Per Zone] getZoneHealthStatus(...)                │
       │      → { status: ZoneHealthStatus, reason: string } │
       │                                                     │
       ├── [Merge] allZones API (empty zones)                │
       │                                                     │
       └────────► zoneKPIs: ref<ZoneKPI[]>                   │
                      │                                      │
                      ▼                                      │
              filteredZoneKPIs (computed)                     │
                      │                                      │
                      ├── filter: totalDevices > 0           │
                      ├── filter: selectedZoneFilter          │
                      │                                      │
                      ▼                                      │
              <template v-for="zone in filteredZoneKPIs">    │
                      │                                      │
                      ├── HEALTH_STATUS_CONFIG[zone.healthStatus]
                      ├── formatAggregatedValue(st, deviceCount)
                      ├── formatRelativeTime(zone.lastActivity)
                      └── isZoneStale(zone.lastActivity)
```

### Funktions-Details

| Funktion | Definiert in | Input | Output | Verschiebbar? |
|----------|-------------|-------|--------|---------------|
| `computeZoneKPIs()` | MonitorView.vue:1018 (lokal) | `espStore.devices`, `allZones`, `deviceContextStore` | `ZoneKPI[]` | **JA** → Composable `useZoneKPIs()` |
| `getZoneHealthStatus()` | MonitorView.vue:979 (lokal) | 6 numerische Params | `{ status, reason }` | **JA** → Utility-Funktion |
| `isZoneStale()` | MonitorView.vue:1171 (lokal) | `lastActivity: string | null` | `boolean` | **JA** → Utility-Funktion |
| `filteredZoneKPIs` | MonitorView.vue:93 (computed) | `zoneKPIs`, `selectedZoneFilter` | `ZoneKPI[]` | **JA** → in `useZoneKPIs()` |
| `groupDevicesByZone()` | `useZoneDragDrop` composable | `devices` | `ZoneGroup[]` | Bereits extern |
| `aggregateZoneSensors()` | `sensorDefaults.ts:1352` | `devices[]` | `ZoneAggregation` | Bereits extern |
| `formatAggregatedValue()` | `sensorDefaults.ts:1419` | `agg, deviceCount` | `string` | Bereits extern |

**Auch fuer L2/andere Views genutzt?**
- `aggregateZoneSensors()` — auch in HardwareView (ZonePlate)
- `getZoneHealthStatus()` — NUR in MonitorView (HardwareView hat eigene Logik)
- `isZoneStale()` — NUR in MonitorView
- `computeZoneKPIs()` — NUR in MonitorView

---

## 3. ZoneKPI Interface (vollstaendig)

```typescript
// MonitorView.vue:952-975 (lokal definiert, nicht exportiert)

type ZoneHealthStatus = 'ok' | 'warning' | 'alarm' | 'empty'

interface ZoneKPI {
  zoneId: string
  zoneName: string
  sensorCount: number             // Total sensors (adjusted for mobile sensors)
  actuatorCount: number           // Total actuators
  activeSensors: number           // Sensors with quality !== 'error'/'stale'
  activeActuators: number         // Actuators with state === true
  alarmCount: number              // Sensors with quality === 'error' or 'bad'
  aggregation: ZoneAggregation    // ReturnType<typeof aggregateZoneSensors>
  lastActivity: string | null     // ISO timestamp of newest sensor reading
  healthStatus: ZoneHealthStatus  // Computed: ok/warning/alarm/empty
  healthReason: string            // Human-readable reason (leer fuer 'ok')
  onlineDevices: number           // ESPs with status 'online' or 'stale'
  totalDevices: number            // Total ESPs in this zone
  mobileGuestCount: number        // Mobile sensors visiting from other zones (6.7)
}

// sensorDefaults.ts:1328-1342
interface ZoneAggregation {
  sensorTypes: {
    type: AggCategory   // 'temperature' | 'humidity' | 'pressure' | ... 10 Typen
    label: string       // z.B. "Temperatur", "Feuchte"
    avg: number
    min: number
    max: number
    count: number
    unit: string        // z.B. "°C", "%", "hPa"
  }[]
  extraTypeCount: number  // Categories beyond the visible 3
  deviceCount: number
  onlineCount: number
}
```

---

## 4. Logic-Rules Mapping

### `getRulesForZone(zoneId)` — Existiert!

**Datei:** [logic.store.ts:301-320](El Frontend/src/shared/stores/logic.store.ts#L301-L320)

```typescript
function getRulesForZone(zoneId: string): LogicRule[]
```

**Mechanismus:** Extrahiert alle `esp_id`s aus Rule-Conditions und Rule-Actions → sucht Device im `espStore` → prueft `device.zone_id === zoneId`.

**Sortierung:** Priority ASC, dann Name alphabetisch.

**Return:** Vollstaendige `LogicRule[]` fuer die Zone.

### `getZonesForRule(rule)` — Existiert!

**Datei:** [logic.store.ts:326-339](El Frontend/src/shared/stores/logic.store.ts#L326-L339)

Umgekehrte Richtung: Gibt Zone-Names fuer eine Regel zurueck.

### Minimale Datenfelder fuer Zone-Kachel-Integration

Fuer eine kompakte Anzeige in der ZoneTileCard ("2 Regeln aktiv — Befeuchter: AN seit 12min") werden benoetigt:

| Feld | Quelle | Beschreibung |
|------|--------|-------------|
| `rule.name` | `LogicRule.name` | Regelname |
| `rule.enabled` | `LogicRule.enabled` | Aktiv? |
| `rule.last_execution_success` | `LogicRule.last_execution_success` | Letzter Status |
| `rule.last_triggered` | `LogicRule.last_triggered` | Wann zuletzt |
| Rule-Count pro Zone | `getRulesForZone(zoneId).length` | Anzahl |
| isActive (glow) | `logicStore.isRuleActive(ruleId)` | Live-Execution |

### RuleCardCompact Props

**Datei:** [RuleCardCompact.vue:15-21](El Frontend/src/components/logic/RuleCardCompact.vue#L15-L21)

```typescript
interface Props {
  rule: LogicRule
  isActive?: boolean       // Glow-Effekt bei Live-Execution
  zoneNames?: string[]     // Zone-Badge fuer L1 (answers "Where?")
}
```

### Kapazitaets-Einschaetzung

Bei 10 Regeln und 3 Zonen → durchschnittlich 3-4 Regeln pro Zone.
**Empfehlung:** Max 2-3 kompakte Regeln in Kachel zeigen + "X weitere" Badge.

---

## 5. InlineDashboardPanel auf L1

### Woher kommen die Panels?

**Getter:** `dashStore.inlineMonitorPanels` → Alias fuer `inlineMonitorPanelsCrossZone`

**Datei:** [dashboard.store.ts:849-863](El Frontend/src/shared/stores/dashboard.store.ts#L849-L863)

```typescript
// Filter-Logik:
const inlineMonitorPanelsCrossZone = computed(() =>
  layouts.value
    .filter(l => _inlineMonitorBase(l) && (l.scope !== 'zone' || l.scope == null))
    .sort((a, b) => (a.target?.order ?? 0) - (b.target?.order ?? 0))
)
```

Bedingung `_inlineMonitorBase`: `target.view === 'monitor' && target.placement === 'inline'`

### Hat DashboardLayout eine `zoneId`?

**JA!** [dashboard.store.ts:85](El Frontend/src/shared/stores/dashboard.store.ts#L85):

```typescript
interface DashboardLayout {
  // ...
  scope?: DashboardScope    // 'zone' | 'cross-zone' | 'sensor-detail'
  zoneId?: string           // Zone-Zuordnung wenn scope === 'zone'
  // ...
}
```

Es gibt auch `inlineMonitorPanelsForZone(zoneId)` (Zeile 856-860) — filtert Layouts mit `scope === 'zone' && zoneId === zoneId`.

### Zone-Scoping moeglich?

**JA, aber mit Einschraenkung:**
- L1 zeigt aktuell **nur cross-zone** Panels (`inlineMonitorPanels === inlineMonitorPanelsCrossZone`)
- Zone-spezifische Panels werden nur auf L2 genutzt (`inlineMonitorPanelsL2` in MonitorView.vue:1631)
- Fuer ZoneTileCard-Integration muesste man `inlineMonitorPanelsForZone(zoneId)` pro Kachel aufrufen

### Widget-Typen auf L1

Verfuegbare Widget-Types: `line-chart`, `gauge`, `sensor-card`, `historical`, `actuator-card`, `actuator-runtime`, `esp-health`, `alarm-list`, `multi-sensor`

**Fuer Zone-Kachel sinnvoll:** `gauge`, `sensor-card` (kompakt), `alarm-list` (pro Zone)
**Zu gross fuer Kachel:** `historical` (braucht Hoehe), `line-chart` (braucht Breite)
**Neutral:** `esp-health` (koennte als Badge passen)

### Widget-Config `zoneFilter`

Einige Widget-Typen haben `config.zoneFilter?: string | null` (Zeile 57) — damit koennte ein Widget bereits pro Zone gefiltert sein.

---

## 6. Subzone-Daten Verfuegbarkeit auf L1

### Kernfrage: Was ist auf L1 OHNE Extra-API-Calls verfuegbar?

**`espStore.devices`** enthaelt pro Device:
- `sensors[].subzone_id` (ID, nicht Name!)
- `sensors[].sensor_type`, `sensors[].raw_value`, `sensors[].unit`, `sensors[].quality`
- `device.zone_id`, `device.zone_name`

**Subzone-NAMEN sind NICHT in `espStore.devices`!**
- Subzone-Namen kommen aus der Subzone-API (`subzonesApi.getSubzones(espId)`)
- `useSubzoneResolver` baut eine Map `(espId, gpio) → { subzoneId, subzoneName }` — aber per separatem API-Call

**`allZones` API-Response (ZoneListEntry):**
```typescript
interface ZoneListEntry {
  zone_id: string
  zone_name: string | null
  device_count: number
  sensor_count: number
  actuator_count: number
  // KEINE subzone-Informationen!
}
```

**`getZoneMonitorData(zoneId)` API:**
- Returned `SubzoneGroup[]` mit `subzone_name`, Sensoren, Aktoren pro Subzone
- Aber: Pro Zone ein separater API-Call, nur auf L2 verwendet (MonitorView.vue:1431)

### Antwort: TEILWEISE

| Datenpunkt | Verfuegbar auf L1? | Quelle |
|------------|-------------------|--------|
| Subzone-IDs | JA | `sensor.subzone_id` in `espStore.devices` |
| Subzone-NAMEN | NEIN | Erfordert `subzonesApi.getSubzones(espId)` |
| Sensor-Werte pro Subzone | JA | Gruppierung nach `sensor.subzone_id` aus `espStore.devices` |
| Subzone-Count | JA | `new Set(sensors.map(s => s.subzone_id)).size` |

### Performance-Einschaetzung

Bei 5 Zonen mit je 2-3 ESPs:
- 5 × `getZoneMonitorData()` API-Calls → **zu teuer fuer L1**
- Subzone-IDs aus `espStore.devices` → **kostenlos (bereits geladen)**
- Subzone-Namen ueber `useSubzoneResolver` → 5-10 API-Calls fuer Subzones pro ESP → **moeglich aber grenzwertig**

### Empfehlung

Fuer eine **Subzone-Summary auf L1** gibt es zwei Optionen:

**Option A (Minimal, kein Extra-Call):** Zeige Subzone-Count pro Zone ("3 Subzones") + aggregierte Sensor-Werte gruppiert nach `subzone_id`. Subzone-IDs als Identifier, keine Namen.

**Option B (Mit Caching):** Subzone-Namen beim ersten L1-Render fuer alle Zonen laden und in einem Cache (Composable/Store) halten. Einmalig ~5-10 API-Calls beim Monitor-Eintritt, danach reaktiv.

**Empfohlene Variante:** Option A fuer MVP, Option B als Follow-up wenn Subzone-Namen gewuenscht.

---

## 7. ZoneTileCard Komponenten-Spec

### Props

```typescript
interface ZoneTileCardProps {
  /** Zone KPI data (Basis-Daten) */
  zone: ZoneKPI

  /** Active logic rules for this zone (max 3 displayed) */
  rules?: LogicRule[]

  /** Count of total rules (wenn rules nur Top-3 zeigt) */
  totalRuleCount?: number

  /** Active rule IDs (for glow effect) */
  activeRuleIds?: Set<string>

  /** Whether the zone's last activity is stale */
  isStale?: boolean

  /** Health status config (label + colorClass mapping) */
  healthConfig?: Record<ZoneHealthStatus, { label: string; colorClass: string }>
}
```

### Emits

```typescript
interface ZoneTileCardEmits {
  (e: 'click', zoneId: string): void     // Navigate to L2
  (e: 'rule-click', ruleId: string): void // Navigate to Logic tab
}
```

### Slots

```typescript
// Named Slots fuer Erweiterbarkeit:
slots: {
  /** Replaces default KPI display area */
  kpis: (props: { zone: ZoneKPI }) => any

  /** Extra content below KPIs (e.g., mini-widgets) */
  extra: (props: { zone: ZoneKPI }) => any

  /** Replaces footer area */
  footer: (props: { zone: ZoneKPI }) => any
}
```

### Design-Entscheidungen

| Frage | Empfehlung | Begruendung |
|-------|-----------|-------------|
| Mini-Widgets als Prop oder Slot? | **Slot** (`extra`) | Flexibler; Widget-Integration ist A4-Scope |
| Kompakt- und Detail-Modus? | **NEIN** — eine Groesse | Detail-Modus waere de facto L2; Kachel soll Uebersicht bleiben |
| Max Kachel-Groesse? | **~200px Hoehe** | Mehr verliert Uebersichts-Charakter bei 4+ Zonen |
| Rules in Kachel? | **Max 2 kompakte Zeilen** + "X weitere" | Mehr als 2 konkurriert visuell mit KPIs |
| Subzone-Summary? | **Nur Count** auf MVP | Namen erfordern Extra-API-Calls (siehe Sektion 6) |

### Interne Struktur

```
ZoneTileCard.vue
├── Header: zoneName + healthStatus Badge
├── Health-Reason (conditional)
├── KPI-Area (slot: kpis)
│   └── Default: aggregation.sensorTypes Loop
├── Rules-Summary (conditional, max 2)
│   └── "{count} Regeln aktiv" + optional 1-Zeiler
├── Extra-Slot (slot: extra)
│   └── z.B. Mini-Widgets, Subzone-Count
└── Footer: Device-Counts + Last-Activity
```

---

## 8. Entscheidungsmatrix

### Pro Element: In Kachel / Eigene Sektion / Entfernen

| Aktueller L1-Block | Empfehlung | Begruendung |
|---------------------|-----------|-------------|
| **Zone-Tiles Grid** (1888-1954) | **→ ZoneTileCard Komponente** | Kernaufgabe dieser Analyse; 67 Zeilen Template + 207 Zeilen CSS raus aus MonitorView |
| **ActiveAutomationsSection** (1958) | **→ IN ZoneTileCard integrieren** (als Rules-Summary) | Pro-Zone-Filter existiert (`getRulesForZone`); globale Sektion wird redundant |
| **Dashboard Overview Card** (1961-2003) | **→ Eigene Sektion BEHALTEN** | Cross-zone Dashboards haben keine Zone-Zuordnung; sind Navigation, nicht Monitoring |
| **InlineDashboardPanel** L1 (2007-2012) | **→ Spaeter in ZoneTileCard Slot** (A4-Scope) | Zone-spezifische Panels existieren bereits (`inlineMonitorPanelsForZone`); cross-zone Panels bleiben global |

### Detail-Matrix pro Tile-Element

| Element | In ZoneTileCard? | Als Prop? | Berechnung wo? |
|---------|-----------------|-----------|-----------------|
| Zone-Name | JA | `zone.zoneName` | Props |
| Health-Badge | JA | `zone.healthStatus` + Config | Props |
| Health-Reason | JA | `zone.healthReason` | Props |
| KPI-Werte | JA | `zone.aggregation` | Props (berechnet in Composable) |
| ESP-Count | JA | `zone.onlineDevices/totalDevices` | Props |
| Sensor-Count | JA | `zone.activeSensors/sensorCount` | Props |
| Aktor-Count | JA | `zone.actuatorCount/activeActuators` | Props |
| Mobile-Guest | JA | `zone.mobileGuestCount` | Props |
| Last-Activity | JA | `zone.lastActivity` | Props |
| Stale-Check | JA | `isStale` Prop | Parent berechnet |
| **Rules-Summary** | **NEU** | `rules` Prop | `logicStore.getRulesForZone()` im Parent |
| **Subzone-Count** | **NEU (optional)** | Via extra Slot | Berechnet aus `espStore.devices` |

---

## 9. Extraktions-Strategie (Implementierungs-Hinweis)

### Phase 1: Reine Extraktion (Keine neue Funktionalitaet)

1. **Composable `useZoneKPIs()`** erstellen:
   - `ZoneKPI` Interface exportieren
   - `computeZoneKPIs()` verschieben
   - `getZoneHealthStatus()` verschieben
   - `isZoneStale()` verschieben
   - `HEALTH_STATUS_CONFIG` verschieben
   - `filteredZoneKPIs` computed verschieben
   - `zoneKPIs` ref + debounced watch verschieben

2. **ZoneTileCard.vue** erstellen:
   - Template 1:1 aus MonitorView.vue extrahieren
   - CSS 1:1 mit-migrieren
   - Props wie in Sektion 7 definiert
   - Emit `click` fuer Navigation

3. **MonitorView.vue** aufraemen:
   - Import ZoneTileCard + useZoneKPIs
   - ~270 Zeilen weniger (67 Template + 207 CSS)

### Phase 2: Fusion (ActiveAutomationsSection aufloesen)

4. **Rules-Summary in ZoneTileCard** integrieren:
   - `logicStore.getRulesForZone(zone.zoneId)` im Parent aufrufen
   - Top 2 Regeln + Count als Props uebergeben
   - ActiveAutomationsSection auf L1 entfernen

### Phase 3: Mini-Widgets (A4-Scope)

5. Zone-spezifische Inline-Panels ueber `extra` Slot einfuegen

---

## Akzeptanzkriterien — Status

- [x] Jedes Element der Zone-Tile ist mit Code-Referenz (Datei:Zeile) dokumentiert → Sektion 1
- [x] ZoneKPI Interface ist vollstaendig mit allen Feldern erfasst → Sektion 3
- [x] `getRulesForZone()` Signatur und Return-Typ dokumentiert → Sektion 4 (existiert, logic.store.ts:301)
- [x] `inlineMonitorPanels` Herkunft und Zone-Scoping-Faehigkeit geklaert → Sektion 5 (zone-scoping moeglich via `zoneId` und `inlineMonitorPanelsForZone`)
- [x] Subzone-Daten-Verfuegbarkeit auf L1 eindeutig beantwortet → Sektion 6 (TEILWEISE: IDs ja, Namen nein)
- [x] Komponenten-Spec fuer ZoneTileCard entworfen (Props/Emits/Slots) → Sektion 7
- [x] Entscheidungsmatrix fuer alle 3 L1-Bloecke → Sektion 8
- [ ] Screenshots nicht moeglich (CLI-Analyse, kein Browser-Zugang)
- [x] Bericht abgelegt unter `.claude/reports/current/analyse-A1-zone-tile-extraktion-2026-03-25.md`
