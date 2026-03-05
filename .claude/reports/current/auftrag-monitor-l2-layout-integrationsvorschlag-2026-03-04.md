# Monitor L2 — Integrationsvorschlag: Layout & UX (System-konform, ohne Legacy)

> **Erstellt:** 2026-03-04  
> **Basis:** `auftrag-monitor-l2-layout-ux-analyse copy.md`, `zonen-subzonen-vollanalyse-bericht-2026-03-04.md`, `auftrag-subzone-funktional-fix.md`  
> **Skills:** frontend-development, server-development  
> **Ziel:** Konkreter Implementierungsvorschlag, der sich nahtlos in bestehende Patterns integriert — keine Duplikationen, keine Legacy.

---

## 1. Executive Summary

| Aspekt | Empfehlung |
|--------|------------|
| **Layout-Variante** | **Variante A (Accordion pro Subzone)** — bereits implementiert, nur verfeinern |
| **Datenquelle** | `useZoneGrouping` erweitern um **GPIO-basierte Subzone-Auflösung** (subzone_configs) |
| **Zählungsregel** | **Nur Sektionsüberschrift** („Sensoren (N)“) — Subzone-Header ohne Count |
| **„Keine Subzone“** | Eindeutiges Label, eigene Accordion-Gruppe, nur wenn Geräte ohne Subzone existieren |
| **Backend** | **Neuer Endpoint** `GET /zone/{zone_id}/monitor-data` ODER Erweiterung `get_hierarchy` um sensors/actuators pro Subzone |
| **Design-System** | AccordionSection, tokens.css, glass-panel — bestehende Primitives nutzen |

---

## 2. Bestandsaufnahme: Aktuelle Monitor L2 Struktur

### 2.1 Komponenten-Hierarchie (MonitorView.vue L2)

```
MonitorView.vue (L2 /monitor/:zoneId)
├── monitor-view__header (Zurück, Zone-Nav, Zone-KPIs)
├── <section class="monitor-section"> Sensoren
│   ├── <h3> Sensoren ({{ zoneSensorCount }})  ← Doppelte Zählung
│   └── <div v-for="subzone"> pro Subzone
│       ├── monitor-subzone__header (Toggle, Status-Dot, Name, KPIs, Count)  ← Count = Dopplung
│       └── monitor-card-grid (SensorCard[])
├── <section class="monitor-section"> Aktoren
│   └── (analog)
├── Zone-Dashboards
└── InlineDashboardPanel[]
```

### 2.2 Datenfluss (aktuell)

```
espStore.devices (reaktiv)
    ↓
useZoneGrouping() → sensorsByZone, actuatorsByZone
    ↓
zoneSensorGroup / zoneActuatorGroup (computed für selectedZoneId)
    ↓
Struktur: ZoneGroup { subzones: SubzoneGroup[] }
    SubzoneGroup { subzoneId, subzoneName, sensors[] }
```

### 2.3 Kritische Lücke: Subzone-Zuordnung (B2)

**useZoneGrouping** nutzt `esp.subzone_id` für **alle** Sensoren/Aktoren eines ESP:

```typescript
// useZoneGrouping.ts Zeile 111–119
const subzoneId = esp.subzone_id || null
return sensors.map(sensor => ({
  ...sensor,
  subzone_id: subzoneId,  // ← FALSCH: ESP hat evtl. mehrere Subzonen
  subzone_name: subzoneName,
}))
```

**Korrektes Modell:** Subzone-Zuordnung ist **pro GPIO** in `subzone_configs.assigned_gpios`. Ein ESP kann mehrere Subzonen haben; jede Subzone hat `(esp_id, subzone_id, assigned_gpios)`.

---

## 3. Backend-Integration (server-development)

### 3.1 Option A: Neuer Endpoint `GET /zone/{zone_id}/monitor-data` (empfohlen)

**Vorteil:** Klar abgegrenzt, Monitor-spezifisch, keine Änderung an Hierarchy.

| Aspekt | Detail |
|--------|--------|
| **Pfad** | `GET /api/v1/zone/{zone_id}/monitor-data` |
| **Auth** | JWT (Active) |
| **Response** | ZoneMonitorData (siehe Schema unten) |
| **Logik** | ZoneService oder neuer MonitorDataService: Devices in Zone laden, SubzoneConfigs pro ESP, Sensor/Actuator-Configs, nach Subzone gruppieren |

**Response-Schema (Pydantic):**

```python
class SubzoneSensorEntry(BaseModel):
    esp_id: str
    gpio: int
    sensor_type: str
    name: str | None
    raw_value: float | None
    unit: str
    quality: str
    last_read: str | None

class SubzoneActuatorEntry(BaseModel):
    esp_id: str
    gpio: int
    actuator_type: str
    name: str | None
    state: bool
    pwm_value: int
    emergency_stopped: bool

class SubzoneGroup(BaseModel):
    subzone_id: str | None  # None = "Keine Subzone"
    subzone_name: str
    sensors: list[SubzoneSensorEntry]
    actuators: list[SubzoneActuatorEntry]

class ZoneMonitorData(BaseModel):
    zone_id: str
    zone_name: str
    subzones: list[SubzoneGroup]
    sensor_count: int
    actuator_count: int
    alarm_count: int
```

**Implementierung:** `El Servador/god_kaiser_server/src/api/v1/zone.py` erweitern, Service-Layer in `zone_service.py` oder neues `monitor_data_service.py`.

### 3.2 Option B: Hierarchy erweitern

`get_hierarchy` um `sensors[]` und `actuators[]` pro Subzone erweitern. **Nachteil:** Hierarchy ist aktuell Zone→Subzone→Devices (ESPs). Subzone hat `assigned_gpios` — aber pro ESP. Die aktuelle Hierarchy-Struktur merged Subzonen mit gleichem ID über ESPs hinweg (assigned_gpios wird überschrieben). Für korrekte Sensor/Aktor-Zuordnung müsste die Struktur geändert werden: Pro (zone, esp, subzone) ein Eintrag mit assigned_gpios, dann Sensoren/Aktoren auflösen.

**Empfehlung:** Option A — sauberer, keine Breaking Changes an Hierarchy.

### 3.3 Keine Änderung an bestehenden Endpoints

- `GET /subzone/devices/{esp_id}/subzones` — bleibt für SubzoneAssignmentSection, useSubzoneCRUD
- `GET /kaiser/god/hierarchy` — bleibt für HierarchyTab (System-Monitor)
- `GET /esp/devices` — bleibt für espStore, HardwareView

---

## 4. Frontend-Integration (frontend-development)

### 4.1 Datenquelle: Zwei Modi

| Modus | Bedingung | Quelle |
|-------|-----------|--------|
| **Neu (empfohlen)** | `GET /zone/{zone_id}/monitor-data` existiert | Direkt vom Server |
| **Fallback** | Endpoint fehlt (Abwärtskompatibilität) | useZoneGrouping mit GPIO-Resolver |

**GPIO-Resolver (Fallback):** Wenn kein Monitor-Data-Endpoint: SubzoneConfigs pro ESP laden (`subzonesApi.getSubzones(espId)`), Map `(esp_id, gpio) → (subzone_id, subzone_name)` bauen, in useZoneGrouping nutzen statt `esp.subzone_id`.

### 4.2 useZoneGrouping erweitern (Fallback-Pfad)

```typescript
// Neuer optionaler Parameter
export interface ZoneGroupingOptions {
  filters?: ZoneGroupingFilters
  /** GPIO→Subzone Map aus subzone_configs (esp_id, gpio) → { subzoneId, subzoneName } */
  subzoneResolver?: Map<string, { subzoneId: string; subzoneName: string }>
}

// In allSensors: statt esp.subzone_id
const key = `${espId}-${sensor.gpio}`
const resolved = options?.subzoneResolver?.get(key)
const subzoneId = resolved?.subzoneId ?? null
const subzoneName = resolved?.subzoneName ?? (subzoneId ?? '')
```

**Resolver aufbauen:** Composable `useSubzoneResolver(zoneId)` — lädt für alle ESPs in Zone die SubzoneConfigs, baut Map.

### 4.3 API-Modul erweitern

```typescript
// api/zones.ts oder api/monitor.ts
export async function getZoneMonitorData(zoneId: string): Promise<ZoneMonitorData> {
  const { data } = await api.get<ZoneMonitorData>(`/zone/${zoneId}/monitor-data`)
  return data
}
```

### 4.4 MonitorView.vue: Datenfluss umstellen

```typescript
// Statt useZoneGrouping (oder parallel für Fallback)
const zoneMonitorData = ref<ZoneMonitorData | null>(null)

watch([selectedZoneId, () => espStore.devices.length], async ([zoneId]) => {
  if (!zoneId) return
  try {
    zoneMonitorData.value = await getZoneMonitorData(zoneId)
  } catch {
    // Fallback: useZoneGrouping mit subzoneResolver
    zoneMonitorData.value = null
  }
}, { immediate: true })

// Oder: Server liefert Live-Daten? Nein — raw_value, quality kommen aus WebSocket/espStore.
// Hybrid: Struktur (Subzone-Gruppierung) vom Server, Live-Werte aus espStore.
```

**Hybrid-Ansatz:** Server liefert nur **Struktur** (welcher Sensor/Aktor in welcher Subzone). Live-Werte (raw_value, quality, state) kommen weiterhin aus espStore/WebSocket. Monitor-Data-Endpoint liefert also: Gruppierung + Metadaten (name, type, unit), keine Live-Werte — oder mit Live-Werten aus DB/Heartbeat (je nach Server-Implementierung).

**Pragmatisch:** Server kann aus sensor_data (letzte Werte) und actuator_configs die aktuellen Werte liefern. Oder Frontend merged: Struktur vom Server, Werte aus espStore nach esp_id+gpio.

---

## 5. Layout-Vorschlag (UX-Optimierung)

### 5.1 Zählungsregel (keine Dopplung)

| Ort | Vorher | Nachher |
|-----|--------|---------|
| Sektionsüberschrift | „Sensoren (5)“ | „Sensoren (5)“ ✓ |
| Subzone-Header | „5 Sensoren“ (bei >1 Subzone) | **Entfernen** |
| Zone-Header KPIs | „5 Sensoren · 3 Aktoren · 1 Alarm“ | Unverändert ✓ |

**Regel:** Zählung nur in Sektionsüberschrift und Zone-Header. Subzone-Header zeigt: Name, Status-Dot, KPI-Werte (z. B. „23,5°C · 65%“), **kein** Count.

### 5.2 Subzone-Header (kompakter)

```
[Chevron] [Status-Dot] Subzone-Name    [23,5°C · 65% · 450ppm]
```

- Status-Dot: `getWorstQualityStatus(sensors)` — bereits vorhanden
- KPI-Werte: `getSubzoneKPIs(sensors)` — max 3, kompakt
- Kein Count-Badge

### 5.3 Accordion-Verhalten

- **≤4 Subzonen:** Alle standardmäßig expanded (wie jetzt)
- **>4 Subzonen:** Nur erste expanded, Rest collapsed
- localStorage-Persistenz pro Zone: `ao-monitor-subzone-collapse-${zoneId}` — bereits implementiert

### 5.4 „Keine Subzone“

- Label: **„Keine Subzone“** (eindeutig)
- Nur anzeigen, wenn mindestens ein Sensor/Aktor **keine** Subzone-Zuordnung hat
- Eigene Accordion-Gruppe, gleiche visuelle Behandlung wie benannte Subzonen

### 5.5 Reihenfolge (auftrag-layout-monitor-seite)

1. Zone-Header (Name, KPIs, Alarm-Count)
2. Sensoren (Sektion)
3. Aktoren (Sektion)
4. Zone-Dashboards
5. Inline-Panels

---

## 6. Design-System Anpassungen

### 6.1 Bestehende Primitives nutzen

| Element | Quelle | Verwendung |
|---------|--------|------------|
| Accordion | AccordionSection.vue | Subzone-Blöcke (bereits Custom-Implementierung in MonitorView) |
| Status-Dot | tokens.css `--color-success/warning/error` | Subzone-Header |
| Glass-BG | `var(--glass-bg)`, `var(--glass-border)` | Subzone-Header |
| Typography | `var(--text-base)`, `var(--text-xs)` | Hierarchie |

### 6.2 Subzone-Header Styling (40px Trennung)

- `padding: var(--space-2) var(--space-3)` (bereits)
- `gap: var(--space-2)` zwischen Elementen
- `margin-bottom: var(--space-4)` zwischen Sektionen (40px laut Device-Config-Panel UX)

### 6.3 Accent-Border (Subzone)

- Linke Border in Zone-Farbe (wie SubzoneArea.vue / ZonePlate)
- `border-left: 3px solid var(--color-zone-{hash})` — Zone-Farben aus tokens.css

---

## 7. Konkrete Änderungspunkte (Implementierungs-Checkliste)

### 7.1 Backend (El Servador)

| # | Datei | Änderung |
|---|-------|----------|
| 1 | `src/api/v1/zone.py` | Neuer Endpoint `GET /zone/{zone_id}/monitor-data` |
| 2 | `src/schemas/zone.py` oder neu `monitor.py` | ZoneMonitorData, SubzoneGroup, SubzoneSensorEntry, SubzoneActuatorEntry |
| 3 | `src/services/zone_service.py` oder neu `monitor_data_service.py` | `get_zone_monitor_data(zone_id)` — Devices, SubzoneConfigs, Sensor/Actuator-Configs laden, gruppieren |

### 7.2 Frontend (El Frontend)

| # | Datei | Änderung |
|---|-------|----------|
| 1 | `src/api/zones.ts` oder `monitor.ts` | `getZoneMonitorData(zoneId)` |
| 2 | `src/composables/useZoneGrouping.ts` | Optional: `subzoneResolver` für Fallback (GPIO→Subzone) |
| 3 | `src/composables/useSubzoneResolver.ts` | **Neu:** Lädt SubzoneConfigs pro ESP in Zone, baut Map `(esp_id, gpio) → subzone` |
| 4 | `MonitorView.vue` | Daten von `getZoneMonitorData` ODER useZoneGrouping+Resolver; Zählung nur in Sektion; Subzone-Header ohne Count |
| 5 | `MonitorView.vue` | „Keine Subzone“-Logik prüfen (nur anzeigen wenn Geräte ohne Subzone) |

### 7.3 Keine Duplikation

- **SensorCard, ActuatorCard** — unverändert, weiterverwenden
- **Accordion-Logik** — bestehende `collapsedSubzones`, `toggleSubzone`, `loadAccordionState` beibehalten
- **getSubzoneKPIs, getWorstQualityStatus** — unverändert
- **Design Tokens** — keine neuen, nur bestehende nutzen

---

## 8. Abhängigkeiten & Reihenfolge

| Phase | Inhalt | Blockiert durch |
|-------|--------|-----------------|
| **1** | Auftrag Subzone-Funktional-Fix (B1, B2) | - |
| **2** | Backend: Monitor-Data-Endpoint | Phase 1 (Datenmodell muss stimmen) |
| **3** | Frontend: API + MonitorView Umstellung | Phase 2 |
| **4** | UX-Feinschliff (Zählung, Subzone-Header) | Phase 3 |

---

## 9. Akzeptanzkriterien

- [ ] Monitor L2 zeigt Sensoren/Aktoren **korrekt nach Subzone gruppiert** (GPIO-basiert)
- [ ] **Keine doppelte Zählung** — nur Sektionsüberschrift „Sensoren (N)“ / „Aktoren (N)“
- [ ] Subzone-Header: Name, Status-Dot, KPI-Werte — **kein** Count
- [ ] „Keine Subzone“ nur angezeigt, wenn Geräte ohne Subzone-Zuordnung existieren
- [ ] Bestehende Patterns (AccordionSection, tokens.css, SensorCard, ActuatorCard) genutzt
- [ ] Keine neuen parallelen Datenflüsse — ein klares Modell (Server Monitor-Data ODER Fallback useZoneGrouping+Resolver)
- [ ] Build: `npm run build` erfolgreich, `vue-tsc --noEmit` fehlerfrei

---

## 10. Referenzen

| Dokument | Inhalt |
|----------|--------|
| `auftrag-monitor-l2-layout-ux-analyse copy.md` | Robins Anforderungen, UX-Prinzipien, Varianten A–D |
| `zonen-subzonen-vollanalyse-bericht-2026-03-04.md` | B2 Monitor L2, Hierarchy-Struktur |
| `auftrag-subzone-funktional-fix.md` | B1, B2 Fix-Strategie |
| `auftrag-layout-monitor-seite-ueberschriften-reihenfolge.md` | Zählung, Reihenfolge |
| `.claude/skills/frontend-development/SKILL.md` | Komponenten, Stores, Design-System |
| `.claude/skills/server-development/SKILL.md` | API, Services, DB-Models |
| `.claude/reference/api/REST_ENDPOINTS.md` | Bestehende Endpoints |
