# Roadmap A1 — Zone-Tile Extraktion + Fusion

> **Erstellt:** 2026-03-25
> **Basis:** Analyse A1 (`.claude/reports/current/analyse-A1-zone-tile-extraktion-2026-03-25.md`)
> **Ergaenzt:** 2026-03-25 durch Analyse B1 (`.claude/reports/current/analyse-B1-backend-api-response-audit-2026-03-25.md`)
> **Verifiziert:** 2026-03-25 — Plan-Review gegen IST-Code (12 Pfade, 5 Store-Refs, 3 Token-Refs geprueft)
> **Typ:** Implementierungs-Roadmap — KEIN Code in dieser Datei
> **Scope:** MonitorView.vue L1 Zone-Tile → eigenstaendige Komponente + Composable
> **Einordnung:** Folgt auf 6.4 L2 Aufraeum-Arbeiten, parallel nutzbar zu Editor Phase A

---

## Hintergrund und Ziel

MonitorView.vue hat ~4006 Zeilen. Die Zone-Tile auf L1 umfasst allein 67 Zeilen Template
(Zeilen 1888–1954) und 207 Zeilen CSS (Zeilen 2832–3038). Die Berechnungslogik
(computeZoneKPIs, getZoneHealthStatus, isZoneStale, filteredZoneKPIs) ist lokal in der View
eingebettet und nicht wiederverwendbar.

**Ziel dieser Roadmap:** Die Zone-Tile in eine eigenstaendige `ZoneTileCard.vue` Komponente
extrahieren, die Berechnungslogik in ein `useZoneKPIs()` Composable auslagern, und die
redundante `ActiveAutomationsSection` (globale Automations-Liste auf L1) in die ZoneTileCard
fusionieren. Das Ergebnis ist MonitorView.vue minus ca. 350 Zeilen und eine testbare,
wiederverwendbare Komponente.

**Designprinzip (aus IoT Dashboard Best Practices):** L1 beantwortet die 5-Sekunden-Frage
"Ist alles in Ordnung?" — Farbe zeigt Status, Kacheln zeigen Zone-Uebersicht. Keine
Konfiguration, keine Aktorsteuerung auf L1. Zone-Kacheln sind reine Navigationselemente (Klick
= Zoom nach L2). Details kommen erst auf L2. Jedes Element das auf L1 mehr als einen Blick
braucht, gehoert nach L2.

---

## Einordnung in die Gesamt-Roadmap

| Schritt | Abhaengigkeit | Empfehlung |
|---------|--------------|------------|
| **6.4 L2 Aufraeum** | Keine | VOR A1 erledigen (betrifft andere Teile von MonitorView, vermeidet Merge-Konflikte) |
| **A1 Phase 1** (Extraktion) | 6.4 erledigt | Danach sofort starten |
| **A1 Phase 2** (Fusion) | A1 Phase 1 | Naechster Commit-Block |
| **A1 Phase 3** (Mini-Widgets) | A1 Phase 2 + Editor Phase A | Separat, spaeter |
| **6.7 Cross-Zone + Mobile** | A1 Phase 1 + Backend-Change | Baut auf ZoneTileCard auf (mobileGuestCount Prop); braucht aber auch Backend-Erweiterung (Gap 1+3 aus Analyse B1) |
| **Editor Phase A** (Zone-Filter + Server-Aggregation) | Keine | Parallel moeglich |

**Beachte:** A1 Phase 1 und Phase 2 blockieren 6.7 nicht, aber 6.7 hat nun zwei Voraussetzungen:
(1) ZoneTileCard muss existieren (A1 Phase 1), und
(2) das Backend muss `device_scope` in E2 (`SubzoneSensorEntry`) liefern und/oder
`active_zone_id` in den Config-Responses (Option C aus Analyse B1). Ohne diese Backend-Aenderung
kann 6.7 zwar die Kachel-Struktur nutzen, aber keine echten Cross-Zone- oder Mobile-Sensordaten
anzeigen.

---

## Phase 1 — Reine Extraktion (Kein neues Verhalten)

**Zeitaufwand:** ~3–4h
**Ziel:** Zero-Delta-Extraction — nach Phase 1 ist die Seite pixel-identisch zur Ausgangslage,
nur der Code ist umgezogen.

---

### Schritt 1.1 — useZoneKPIs Composable erstellen

**Aufwand:** ~1.5h

**IST:** `computeZoneKPIs()`, `getZoneHealthStatus()`, `isZoneStale()`, `filteredZoneKPIs`
(computed), `zoneKPIs` (ref) und der debounced Watch (300ms) liegen alle lokal in
MonitorView.vue. `ZoneKPI` und `ZoneHealthStatus` sind lokale Typen (nicht exportiert).
`HEALTH_STATUS_CONFIG` ist ebenfalls lokal. `ZoneAggregation` ist KEIN benannter lokaler Typ —
der Code nutzt `ReturnType<typeof aggregateZoneSensors>` inline im ZoneKPI-Interface (Zeile 962).
Beim Export aus dem Composable einen eigenen Type-Alias `ZoneAggregation` erstellen.

**SOLL:** Neue Datei `El Frontend/src/composables/useZoneKPIs.ts` mit:

```
useZoneKPIs(options?: { filter?: Ref<string | null> })
  returns:
    zoneKPIs: Readonly<Ref<ZoneKPI[]>>
    filteredZoneKPIs: ComputedRef<ZoneKPI[]>
    HEALTH_STATUS_CONFIG: Record<ZoneHealthStatus, { label: string; colorClass: string }>
    isZoneStale: (lastActivity: string | null) => boolean
```

Die Typen `ZoneKPI`, `ZoneHealthStatus`, `ZoneAggregation` werden aus dem Composable
exportiert (damit ZoneTileCard.vue sie als Props-Typen verwenden kann).

**Hinweis zur getZoneHealthStatus() Signatur:** Die Funktion hat 6 Parameter (nicht 5):
`getZoneHealthStatus(alarmCount, activeSensors, sensorCount, onlineDevices, totalDevices,
emergencyStoppedCount)`. Bei der 1:1-Extraktion ins Composable alle 6 Parameter uebernehmen.

**Datenfluss bleibt identisch:**
- espStore.devices → computeZoneKPIs() (watch, deep: true, debounce 300ms)
- allZones API (fuer leere Zonen-Merge)
- deviceContextStore.getActiveZoneId() fuer mobileGuestCount
- aggregateZoneSensors() aus sensorDefaults.ts — unveraendert importiert
- groupDevicesByZone() aus useZoneDragDrop — unveraendert importiert

**Wichtig — Dateneinschraenkung (Analyse B1, Abschnitt 4):**
`espStore.devices` wird ueber `GET /api/v1/esp/devices` (E1) bevoelkert. Dieser Endpoint
liefert KEINE `device_scope`-, `assigned_zones`- oder `assigned_subzones`-Felder — weder im
Schema (`ESPDeviceListResponse`) noch in der Live-Response. Diese Felder sind nur in
`GET /api/v1/sensors/` (E3) und `GET /api/v1/actuators/` (E5) verfuegbar.

**Konsequenz fuer Phase 1:** `computeZoneKPIs()` / `useZoneKPIs()` hat in Phase 1 keinen
Zugriff auf `device_scope`. Das ist fuer die reine Extraktion KEIN Problem — Phase 1 aendert
kein Verhalten. Aber fuer Phase 3 (Mini-Widgets, Cross-Zone) und fuer 6.7 (Mobile-Guest-Count)
gilt: `device_scope`-basierte Logik kann nicht aus `espStore.devices` kommen. Loesungsweg
steht in Abschnitt "Backend-Gaps und Abhaengigkeiten" unten.

**Achtung Quellcode-Layout:** `filteredZoneKPIs` (Zeile 93–97) und `zoneKPIs` ref (~Zeile 1150)
liegen weit auseinander in MonitorView.vue. `filteredZoneKPIs` referenziert `zoneKPIs.value` —
funktioniert durch ref-Hoisting in `<script setup>`. Beim Extrahieren BEIDE ins Composable
verschieben (gehoeren logisch zusammen).

**Was NICHT verschoben wird:**
- `selectedZoneFilter` (bleibt als Parameter/Option vom Composable empfangen)
- `goToZone()` Navigationsfunktion (bleibt in MonitorView)
- `allZones` API-Call-Logik (kann als Parameter uebergeben werden oder im Composable liegen —
  Entscheidung: im Composable, weil der Call eng zur ZoneKPI-Berechnung gehoert)

**Betroffene Dateien:**
- NEU: `El Frontend/src/composables/useZoneKPIs.ts`
- EDIT: `El Frontend/src/views/MonitorView.vue` (Import + Aufruf ersetzen)

**Akzeptanzkriterien:**
- [ ] `npm run type-check` laeuft ohne neue Fehler
- [ ] MonitorView.vue ist um ~80 Zeilen kuerzer (computeZoneKPIs ~50 Zeilen + Hilfsfunktionen)
- [ ] `filteredZoneKPIs` im Template funktioniert identisch (dieselbe Anzahl Kacheln,
  dieselbe Reihenfolge)
- [ ] ZoneKPI Interface ist aus `useZoneKPIs.ts` importierbar

---

### Schritt 1.2 — ZoneTileCard.vue erstellen

**Aufwand:** ~1.5h

**IST:** Template-Block 1888–1954 (67 Zeilen) und CSS-Block 2832–3038 (207 Zeilen) direkt in
MonitorView.vue.

**SOLL:** Neue Datei `El Frontend/src/components/monitor/ZoneTileCard.vue` mit:

**Props (exakt wie in Analyse A1 Sektion 7 spezifiziert):**

```typescript
interface Props {
  zone: ZoneKPI                                             // Pflicht
  isStale?: boolean                                         // berechnet in Parent via isZoneStale()
  healthConfig?: Record<ZoneHealthStatus, { label: string; colorClass: string }>
  // rules, totalRuleCount, isRuleActive kommen erst in Phase 2
}
```

**Emits:**

```typescript
interface Emits {
  (e: 'click', zoneId: string): void
}
```

**Slots:**

```typescript
// kpis: ersetzt KPI-Bereich (fuer spaetere Erweiterungen)
// extra: unterhalb der KPIs (fuer Phase 3 Mini-Widgets)
// footer: ersetzt Footer-Bereich
```

**Imports in ZoneTileCard (vollstaendige Liste):**
```typescript
// Utils
import { formatAggregatedValue, aggregateZoneSensors } from '@/utils/sensorDefaults'
import { formatRelativeTime } from '@/utils/formatters'
// Icons (Lucide)
import { CheckCircle2, AlertTriangle, Minus, XCircle, Clock } from 'lucide-vue-next'
// Types
import type { ZoneKPI, ZoneHealthStatus } from '@/composables/useZoneKPIs'
```

**CSS-Migration:** Alle `.monitor-zone-tile*` Klassen kommen in den `<style scoped>` Block der
Komponente. **`.monitor-zone-grid`** (der Grid-Container ab L2832) bleibt in MonitorView — er
ist ein Layout-Container der die Kacheln anordnet, kein Tile-internes Styling. Nur die
`.monitor-zone-tile*` Klassen wandern mit.

Dabei die drei hardcodierten Gap-Werte durch Design-Tokens ersetzen:
- `gap: 4px` in `.monitor-zone-tile__status` → `gap: var(--space-1)`
- `gap: 1px` in `.monitor-zone-tile__kpi` → beibehalten als `gap: 1px` mit Kommentar
  `/* no token for 1px — --space-px existiert nicht, kleinster Token ist --space-1 (4px) */`
- `gap: 3px` in `.monitor-zone-tile__activity` → auf `gap: var(--space-1)` (4px) setzen —
  konsistenter mit dem 4px-Grid

**Dynamische CSS-Klassen (unveraendert):**
```
:class="['monitor-zone-tile', `monitor-zone-tile--${zone.healthStatus}`]"
```

**Betroffene Dateien:**
- NEU: `El Frontend/src/components/monitor/ZoneTileCard.vue`
- EDIT: `El Frontend/src/views/MonitorView.vue`
  (Template: `<ZoneTileCard>` statt inline-Block; CSS-Block 2832–3038 entfernen)

**Akzeptanzkriterien:**
- [ ] MonitorView.vue verliert 67 Zeilen Template + 207 Zeilen CSS = ~274 Zeilen
- [ ] Visual Regression: Zone-Kacheln sehen pixel-identisch aus (alle 4 Status: ok / warning /
  alarm / empty)
- [ ] `@click` auf Kachel navigiert korrekt nach `/monitor/:zoneId`
- [ ] Stale-Status (`--stale` Klasse auf Last-Activity) funktioniert
- [ ] Sensor-Count-Farben (`--ok`, `--warn`, `--alarm`) funktionieren
- [ ] `npm run type-check` ohne neue Fehler

---

### Schritt 1.3 — MonitorView aufraemen

**Aufwand:** ~0.5h

**IST:** Nach 1.1 und 1.2 hat MonitorView noch verwaiste lokale Typen, ggf. doppelte Imports.

**SOLL:**
- Keine lokalen ZoneKPI / ZoneHealthStatus Typ-Definitionen mehr in MonitorView
- Import-Block bereinigt (keine unbenutzten Imports)
- `v-for="zone in filteredZoneKPIs"` nutzt `<ZoneTileCard>` mit korrekten Props

**Betroffene Dateien:**
- EDIT: `El Frontend/src/views/MonitorView.vue`

**Akzeptanzkriterien:**
- [ ] `npm run build` ohne neue Warnings
- [ ] ESLint ohne neue Fehler
- [ ] MonitorView.vue unter 3700 Zeilen

---

## Phase 2 — Fusion (ActiveAutomationsSection aufloesen)

**Zeitaufwand:** ~1.5–2h
**Ziel:** Die globale ActiveAutomationsSection auf L1 (zeigt alle Regeln, ungefiltert) wird
durch eine kompakte Rules-Summary pro ZoneTileCard ersetzt. Das Ergebnis: Jede Kachel zeigt
sofort "2 Regeln aktiv" — der User muss nicht scrollen um zu verstehen welche Regeln welche
Zone betreffen.

**Designprinzip (warum Fusion statt behalten):** Die globale ActiveAutomationsSection
widerspricht der Zone-orientierten Informationshierarchie. Ein User der Zone "Zelt" sehen will
muss mentale Arbeit leisten: Kachel betrachten → nach unten scrollen → Regeln-Liste lesen →
Regel-Zone zuordnen. Nach der Fusion steht alles in der Kachel. Das Pattern entspricht
ThingsBoard's Approach: Zone-Tiles zeigen Status UND aktive Automationen, kein separates
Automations-Panel auf L1.

---

### Schritt 2.1 — Rules-Props und Summary in ZoneTileCard

**Aufwand:** ~1h

**IST:** ZoneTileCard kennt keine Regeln. ActiveAutomationsSection ist ein globaler Block nach
den Zone-Kacheln auf L1.

**SOLL:** ZoneTileCard erhaelt drei neue optionale Props:

```typescript
rules?: LogicRule[]          // Top-2 Regeln fuer diese Zone (aus logicStore.getRulesForZone())
totalRuleCount?: number      // Gesamtanzahl Regeln (wenn rules nur Top-2 liefert)
isRuleActive?: (ruleId: string) => boolean  // Callback fuer Glow-Effekt
```

**Aktive Regeln ermitteln:** `logicStore.activeRuleIds` existiert NICHT. Der Store hat:
- `logicStore.activeExecutions` (Typ: `Map<string, number>`, logic.store.ts:76)
- `logicStore.isRuleActive(ruleId)` (logic.store.ts:514) — prueft ob ID in activeExecutions

Empfehlung: `isRuleActive` direkt als Callback-Prop uebergeben (`:is-rule-active="logicStore.isRuleActive"`).
Das ist sauberer als ein Set zu bauen und vermeidet eine zusaetzliche Reaktivitaetsschicht.

**UI innerhalb ZoneTileCard (zwischen KPI-Area und Footer):**

```
[Rules-Summary] — nur wenn totalRuleCount > 0
  - "2 Regeln" (grau wenn alle inaktiv, blau wenn ≥1 aktiv)
  - Optionale 1-Zeiler: Name der letzten ausgeloesten Regel (wenn last_triggered vorhanden)
  - Max. 2 kompakte Regeln sichtbar + "X weitere" Badge wenn totalRuleCount > 2
```

**Berechnung im Parent (MonitorView):** Pro Kachel einmal `logicStore.getRulesForZone(zone.zoneId)`
aufrufen. `getRulesForZone()` existiert bereits in `logic.store.ts:301` und gibt sortierte
`LogicRule[]` zurueck (Priority ASC, dann Name alphabetisch). Top-2 als `rules` Prop uebergeben,
`.length` als `totalRuleCount`. `logicStore.isRuleActive` als `isRuleActive` Callback-Prop.

**Betroffene Dateien:**
- EDIT: `El Frontend/src/components/monitor/ZoneTileCard.vue`
  (Props erweitern, Rules-Summary Template-Block hinzufuegen, CSS fuer Rules-Summary)
- EDIT: `El Frontend/src/views/MonitorView.vue`
  (logicStore importieren, getRulesForZone() im v-for aufrufen, Props uebergeben)

**Akzeptanzkriterien:**
- [ ] Zone mit 0 Regeln: Rules-Summary nicht sichtbar
- [ ] Zone mit 1 Regel: "1 Regel" angezeigt, Regelname sichtbar
- [ ] Zone mit 3 Regeln: "2 Regeln" + "1 weitere" Badge
- [ ] Aktive Regel (glow): `isRuleActive(rule.id)` triggert sichtbaren Glow-Effekt
- [ ] Kachel-Hoehe bleibt unter ~220px (inklusive Rules-Summary mit 1 Regel)

---

### Schritt 2.2 — ActiveAutomationsSection auf L1 entfernen

**Aufwand:** ~0.5h

**IST:** `ActiveAutomationsSection` ist ein eigenstaendiger Block nach den Zone-Kacheln.
Zeigt alle aktivierten Regeln ungefiltert. User muss scrollen.

**SOLL:** Block wird entfernt. Rules-Info ist jetzt in jeder Kachel. Globale Regeln (ohne
Zonen-Bezug) koennen ueber den Logic-Tab erreicht werden.

**Randbedingung:** `ActiveAutomationsSection.vue` ist eine eigenstaendige Komponente in
`components/monitor/` (verifiziert). Datei vorerst behalten aber nicht mehr in MonitorView
eingebunden (kann spaeter geloescht oder in Logic-View integriert werden).

**Namenskonflikt vermeiden:** `ZoneRulesSection.vue` existiert bereits in `components/monitor/`.
Diese Komponente zeigt Regeln auf L2 (detailliert, bis 10 sichtbar). Phase 2 fuegt eine
**kompakte** Rules-Summary fuer L1 hinzu — das ist ein anderer Use-Case (L1 = 2 Zeilen Summary,
L2 = vollstaendige Liste). Kein Konflikt, aber der Name der neuen UI sollte klar abgegrenzt
sein (z.B. `rules-summary` Klasse innerhalb ZoneTileCard, KEIN eigener `ZoneRulesSummary.vue`).

**Betroffene Dateien:**
- EDIT: `El Frontend/src/views/MonitorView.vue`

**Akzeptanzkriterien:**
- [ ] L1 zeigt keine separate Automations-Sektion mehr
- [ ] Alle Regeln die vorher in ActiveAutomationsSection sichtbar waren, sind jetzt
  in den jeweiligen Kacheln sichtbar
- [ ] MonitorView.vue unter 3500 Zeilen

---

## Phase 3 — Mini-Widgets via extra-Slot (A4-Scope)

**Zeitaufwand:** ~2–3h (eigener separater Auftrag)
**Voraussetzung:** A1 Phase 1 + Phase 2 abgeschlossen. Editor Phase A (Zone-Filter auf
Dashboard-Widgets) abgeschlossen.

**Ziel:** Zone-spezifische `InlineDashboardPanel`-Instanzen ueber den `extra`-Slot der
ZoneTileCard einfuegen. Damit kann ein Nutzer pro Zone ein Mini-Widget (z.B. Gauge fuer
Hauptsensor) konfigurieren das direkt auf der Kachel erscheint.

**Hintergrund:** `inlineMonitorPanelsForZone(zoneId)` in `dashboard.store.ts:856` existiert
bereits und gibt Layouts mit `scope === 'zone' && zoneId === zoneId` zurueck. Der Filter
funktioniert. Auf L1 wird aktuell nur `inlineMonitorPanelsCrossZone` gezeigt. Zone-spezifische
Panels werden nur auf L2 genutzt.

**Was Phase 3 macht:**
1. Pro Kachel: `dashStore.inlineMonitorPanelsForZone(zone.zoneId)` aufrufen
2. Wenn Panels vorhanden: in `extra`-Slot der ZoneTileCard rendern
3. Widget-Typen auf "Kachel-geeignet" beschraenken: `gauge`, `sensor-card` (kompakt),
   `alarm-list` (pro Zone). Nicht geeignet: `historical`, `line-chart` (zu breit/hoch)
4. Max. 1 Widget pro Kachel (Kacheln-Charakter erhalten, ~200px Hoehe-Limit)

**Was Phase 3 NICHT macht:**
- Kein neues Widget-Konfigurationsinterface auf L1 (Konfiguration bleibt im Editor-Tab)
- Keine Multi-Widget-Anzeige pro Kachel
- Keine Aenderung an dashboard.store.ts oder DashboardLayout-Schema

**Auftrag wird separat formuliert** wenn A1 Phase 1+2 und Editor Phase A abgeschlossen sind.

---

## Backend-Gaps und Abhaengigkeiten (aus Analyse B1)

Diese Abschnitt fasst zusammen was Analyse B1 an Backend-Luecken aufgedeckt hat und was das
fuer diese Roadmap bedeutet. Kein Code-Aenderungsbedarf in Phase 1+2 — aber wichtig fuer
Phase 3 und 6.7.

### Gap 1 — E2 SubzoneSensorEntry ohne device_scope

`GET /api/v1/zone/{id}/monitor-data` laeuft ueber `monitor_data_service.py`. Der Service laedt
das `SensorConfig` ORM-Objekt (das `device_scope` enthaelt), mappt es aber nur als
`SubzoneSensorEntry` (8 Felder: esp_id, gpio, sensor_type, name, raw_value, unit, quality,
last_read). `device_scope` wird geladen aber NICHT in die Response gemappt.

**Auswirkung auf Phase 1+2:** Keine — `useZoneKPIs()` benoetigt `device_scope` nicht.
**Auswirkung auf Phase 3 / 6.7:** Wenn Zone-Kacheln mobile Sensoren anzeigen sollen
("Sensor ist gerade in dieser Zone"), braucht MonitorView `device_scope` aus E2. Fix ist
minimal: ein Feld in `SubzoneSensorEntry` und `ZoneMonitorData` hinzufuegen (Backend-Change).
Das ORM-Objekt hat das Feld bereits — es wird nur nicht gemappt.

### Gap 2 — E1 ESP-Liste ohne device_scope

`GET /api/v1/esp/devices` liefert `ESPDeviceListResponse`. Diese Response hat weder
`device_scope` noch `assigned_zones` noch `active_zone_id`. Der Endpoint laedt nur
ESP-Device-Objekte plus Sensor/Aktor-Counts (nicht die Detail-Configs).

**Auswirkung auf Phase 1+2:** Keine.
**Auswirkung auf 6.7 / mobileGuestCount:** `deviceContextStore.getActiveZoneId()` (das
die Roadmap fuer `mobileGuestCount` referenziert) nutzt `device_active_context` — eine
separate Tabelle. Diese Tabelle hat aktuell 0 Eintraege (alle Geraete sind `zone_local`). Der
Mechanismus existiert, aber er ist noch nicht durch UI belegbar.

### Gap 3 — active_zone_id nirgends in Standard-Responses

`active_zone_id` (dynamischer Laufzeit-Context) ist in KEINER Standard-Response vorhanden —
weder E1 noch E2 noch E3-E6. Nur `GET /api/v1/device-context/sensor/{id}` (E7) und
`GET /api/v1/device-context/actuator/{id}` (E8) liefern es — aber pro Geraet ein separater
Call (N+1 Problem). Der 30-Sekunden-Cache in `DeviceScopeService` laeuft server-seitig.

**Empfehlung aus Analyse B1 (Option C):** `active_zone_id` in `SensorConfigResponse` einbetten
via LEFT JOIN auf `device_active_context` in den Config-Endpoints. Das vermeidet einen separaten
Store. Alternativ: Bulk-Endpoint `GET /device-context/bulk?scope=mobile,multi_zone`.

**Auswirkung auf Phase 1+2:** Keine.
**Auswirkung auf Phase 3 / 6.7:** Wenn "Mobiler Sensor zeigt Gastzone auf Kachel" eine
Anforderung ist, muss entweder Option C (Backend-Change in Sensor-Config-Endpoint) oder ein
Bulk-Endpoint implementiert werden, BEVOR Phase 3 das Feature einbauen kann.

### Bestaetigt: Backend-Schema hat Cross-Zone-Felder — aber Vorsicht bei Endpoints

`SensorConfigUpdate` und `ActuatorConfigUpdate` Schemas haben `device_scope`, `assigned_zones`,
`assigned_subzones` als optionale Felder. **ABER:** Diese Schemas werden von keinem Endpoint
als Request-Body verwendet (unused). Updates laufen ueber `SensorConfigCreate` /
`ActuatorConfigCreate`.

**Korrekte Update-Pfade:**
- Sensoren: `POST /api/v1/sensors/{esp_id}/{gpio}` (Body: `SensorConfigCreate`)
- Aktoren: `POST /api/v1/actuators/{esp_id}/{gpio}` (Body: `ActuatorConfigCreate`)
- Device-Context: `GET /api/v1/device-context/{config_type}/{config_id}` (parametrisiert)

Es gibt KEINE PUT-Endpoints fuer Sensor/Aktor-Config. Ob `SensorConfigCreate` bereits
`device_scope` akzeptiert, muss vor Phase 3 / 6.7 geprueft werden.

---

## Nicht-Ziele (explizit ausgeschlossen)

Die folgenden Punkte sind bewusst NICHT Teil dieser Roadmap:

- **Dashboard Overview Card** (Zeilen 1961–2003) — bleibt unveraendert. Cross-Zone-Dashboards
  haben keine Zone-Zuordnung und sind Navigations-Elemente, keine Monitoring-Elemente.
- **InlineDashboardPanel** cross-zone auf L1 — bleibt unveraendert. Nur Zone-spezifische
  Panels kommen in Phase 3.
- **L2 MonitorView Umstrukturierung** — separater Scope (6.4, nicht A1).
- **useZoneKPIs Erweiterung fuer Subzone-Namen** — Subzone-Namen erfordern Extra-API-Calls
  pro Zone und sind zu teuer fuer L1. Subzone-Count (aus `espStore.devices` ohne API-Call)
  koennte optional in Phase 3 als Badge hinzukommen.
- **Aktorsteuerung in der Kachel** — Monitor L1 ist Read-Only. Aktorsteuerung gehoert in den
  Editor-Tab oder in L2 (Orbital). Das ist Kern-Architekturprinzip: Monitor = Anzeige,
  Editor = Steuerung + Konfiguration.
- **Animations oder neue Transitions** fuer ZoneTileCard.
- **Neue API-Endpoints** — alle noetigen Daten fuer Phase 1+2 sind bereits im Frontend-Store
  vorhanden. Fuer Phase 3 und 6.7 sind jedoch Backend-Erweiterungen noetig (siehe Abschnitt
  "Backend-Gaps und Abhaengigkeiten").

---

## Gesamt-Aufwand-Uebersicht

| Phase | Schritt | Aufwand | Abhaengigkeit |
|-------|---------|---------|--------------|
| **Phase 1** | 1.1 useZoneKPIs Composable | ~1.5h | 6.4 erledigt |
| **Phase 1** | 1.2 ZoneTileCard.vue erstellen | ~1.5h | 1.1 erledigt |
| **Phase 1** | 1.3 MonitorView aufraemen | ~0.5h | 1.1 + 1.2 erledigt |
| **Phase 2** | 2.1 Rules-Props + Summary | ~1h | Phase 1 komplett |
| **Phase 2** | 2.2 ActiveAutomationsSection entfernen | ~0.5h | 2.1 erledigt |
| **Phase 3** | Mini-Widgets via extra-Slot | ~2–3h | Phase 2 + Editor Phase A |
| **Gesamt Phase 1+2** | | **~5–5.5h** | |
| **Gesamt Phase 1+2+3** | | **~7–8.5h** | |

---

## Technische Hinweise fuer den ausfuehrenden Agenten

### Dateistruktur im auto-one Repo

```
El Frontend/src/
  composables/
    useZoneKPIs.ts              ← NEU (Schritt 1.1)
  components/
    monitor/
      ZoneTileCard.vue          ← NEU (Schritt 1.2)
  views/
    MonitorView.vue             ← EDIT (alle Schritte)
  shared/
    stores/
      logic.store.ts            ← NUR LESEN (getRulesForZone existiert bereits)
      dashboard.store.ts        ← NUR LESEN (inlineMonitorPanelsForZone existiert bereits)
```

### Design-Token System

AutomationOne nutzt 129 Design-Tokens mit semantischen Prefixes in
`El Frontend/src/styles/tokens.css`. **KEIN `--ao-*` Prefix** — die Tokens heissen `--color-*`, `--glass-*`, `--space-*`,
`--elevation-*`, `--text-*`.

Relevante Tokens fuer ZoneTileCard:
- `--space-1` = 4px (ersetzt `gap: 4px`)
- `--text-xs` = 11px (Minimum-Schriftgroesse fuer Badges)
- **Health-Status-Farben im IST-Code:** Die Zone-Tile CSS (L2870–2920) benutzt
  `--color-success`, `--color-warning`, `--color-error` — NICHT `--color-status-good` /
  `--color-status-alarm`. Die `--color-status-*` Tokens existieren zwar in tokens.css (L223/225),
  werden aber vom Zone-Tile-Code nicht verwendet. **Bei Zero-Delta-Extraction die bestehenden
  CSS-Variablen NICHT umbenennen** — `--color-success`, `--color-warning`, `--color-error`
  beibehalten wie im IST-Code.

### API-Felder — was welcher Endpoint liefert (Analyse B1)

Die beiden Endpoints die MonitorView am haeufigsten benutzt:

| Endpoint | Schema | device_scope | assigned_zones | active_zone_id |
|----------|--------|:---:|:---:|:---:|
| `GET /esp/devices` (E1, espStore) | `ESPDeviceListResponse` | NEIN | NEIN | NEIN |
| `GET /zone/{id}/monitor-data` (E2) | `ZoneMonitorData` / `SubzoneSensorEntry` | NEIN | NEIN | NEIN |
| `GET /sensors/` (E3) | `SensorConfigResponse` | JA | JA | NEIN |
| `GET /actuators/` (E5) | `ActuatorConfigResponse` | JA | JA | NEIN |
| `GET /device-context/{config_type}/{config_id}` (E7) | `DeviceContextResponse` | NEIN | NEIN | JA |

**Relevanz fuer Phase 1+2:** Der `useZoneKPIs()`-Composable haengt von `espStore.devices` ab
(E1). Da E1 kein `device_scope` liefert, hat das Composable in Phase 1+2 keinen Zugriff darauf.
Das ist kein Problem — Phase 1+2 braucht `device_scope` nicht. Aber beim Erweitern von
`useZoneKPIs()` in Phase 3 darf nicht davon ausgegangen werden, dieses Feld aus dem Store
lesen zu koennen. Es muss explizit aus E3 geladen oder das Backend muss E2 erweitern.

**`device_active_context` Tabelle aktuell leer:** Alle laufenden Geraete haben
`device_scope = 'zone_local'`. Context-Eintraege entstehen erst wenn ein
Device-Context-Update aufgerufen wird. Der `mobileGuestCount`-Mechanismus ist also
vorbereitet, aber aktuell inaktiv.

### WS-Events die ZoneKPI-Daten aktualisieren

`sensor_data` und `esp_health` WS-Events triggern den `espStore.devices` Watch in
`computeZoneKPIs()`. Dieser Watch hat 300ms Debounce — das muss in `useZoneKPIs()` erhalten
bleiben (kein direktes computed ohne Debounce).

### LogicStore Zugriff

`logicStore.getRulesForZone(zoneId)` in `logic.store.ts:301`:
- Gibt `LogicRule[]` sortiert nach Priority ASC, dann Name zurück
- Intern: ESP-IDs aus Conditions + Actions extrahieren → `espStore.devices` lookup → `zone_id`
  Vergleich
- Ist reactive, aber nicht live-subscribed (rechnet bei Aufruf frisch)
- Fuer Phase 2: Im v-for von MonitorView einmalig pro Zone aufrufen (nicht in Computed,
  da getRulesForZone selbst reactive computation ist)

### Commit-Strategie

Jeder Schritt (1.1, 1.2, 1.3, 2.1, 2.2) sollte ein eigener Commit sein. So ist jeder
Schritt einzeln revertierbar und testbar. Keine Phase-uebergreifenden Commits.

Empfohlene Commit-Messages:
```
refactor(monitor): extract useZoneKPIs composable (step 1.1)
refactor(monitor): extract ZoneTileCard component (step 1.2)
refactor(monitor): cleanup MonitorView imports after extraction (step 1.3)
feat(monitor): add rules summary to ZoneTileCard (step 2.1)
refactor(monitor): remove ActiveAutomationsSection from L1 (step 2.2)
```

---

## Akzeptanzkriterien Gesamt (nach Phase 1+2)

- [ ] MonitorView.vue unter 3500 Zeilen (war ~4006)
- [ ] `useZoneKPIs.ts` exportiert ZoneKPI Interface + alle Hilfsfunktionen
- [ ] `ZoneTileCard.vue` ist in sich geschlossen (keine MonitorView-spezifischen Importe)
- [ ] L1 Darstellung pixel-identisch zur Ausgangslage (Zone-Name, Health-Badge, KPIs, Counts,
  Last-Activity)
- [ ] Rules-Summary zeigt korrekte Anzahl pro Zone
- [ ] ActiveAutomationsSection nicht mehr auf L1 sichtbar
- [ ] `npm run type-check` ohne neue Fehler
- [ ] `npm run build` ohne neue Warnings
- [ ] Visueller Test: Alle 4 Health-Status (ok / warning / alarm / empty) korrekt dargestellt
