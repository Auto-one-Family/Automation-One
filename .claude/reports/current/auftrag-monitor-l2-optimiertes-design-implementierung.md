# Auftrag: Monitor L2 — Implementierung optimiertes Design (System-konform)

> **Erstellt:** 2026-03-04  
> **Basis:** `auftrag-monitor-l2-layout-integrationsvorschlag-2026-03-04.md`  
> **Priorität:** Mittel (nach Subzone-Funktional-Fix)  
> **Ziel:** Exakter Implementierungsauftrag für das optimierte Monitor L2 Layout — nahtlos in bestehende Struktur, keine Duplikationen, keine Legacy.  
> **Skills:** frontend-development, server-development  
> **Referenz-Wissen:** automation-experte Agent (UX-Audit, IoT-Dashboard-Design, Device-Config-Panel, tokens.css, AccordionSection)

---

## 1. Voraussetzungen

| # | Voraussetzung | Status |
|---|---------------|--------|
| 1 | **Subzone-Funktional-Fix** (auftrag-subzone-funktional-fix.md) — B1, B2 behoben | Muss vor oder parallel erledigt sein |
| 2 | Subzone-Zuordnung GPIO-basiert (subzone_configs.assigned_gpios) | Backend-Datenmodell vorhanden |
| 3 | Bestehende Komponenten: SensorCard, ActuatorCard, AccordionSection, tokens.css | Unverändert nutzen |

---

## 2. Architektur-Entscheidungen (aus Integrationsvorschlag)

| Aspekt | Entscheidung | Begründung |
|--------|--------------|------------|
| **Datenquelle** | Neuer Endpoint `GET /zone/{zone_id}/monitor-data` | Klar abgegrenzt, Monitor-spezifisch, keine Breaking Changes an Hierarchy |
| **Fallback** | useZoneGrouping + useSubzoneResolver (GPIO→Subzone Map) | Abwärtskompatibilität wenn Endpoint fehlt |
| **Layout** | Variante A — Accordion pro Subzone | Bereits implementiert, nur verfeinern; platzsparend (iot-dashboard-design) |
| **Zählung** | Nur Sektionsüberschrift „Sensoren (N)“ / „Aktoren (N)“ | Keine doppelte Zählung (auftrag-layout-monitor) |
| **Subzone-Header** | Name, Status-Dot, KPI-Werte — kein Count | Kompakter (Device-Config-Panel: 40px Trennung) |
| **„Keine Subzone“** | Eigene Accordion-Gruppe, nur wenn Geräte ohne Subzone | Eindeutig (Robin-Anforderung) |
| **Design** | AccordionSection, tokens.css, glass-panel, Accent-Border | Bestehende Primitives (Dashboard_analyse, UX-Audit) |

---

## 3. UX-Prinzipien (aus automation-experte Wissen)

| Prinzip | Quelle | Anwendung Monitor L2 |
|---------|--------|----------------------|
| **5-Sekunden-Regel** | iot-dashboard-design-best-practices | Status (OK/Warnung/Kritisch) in 5 Sekunden erkennbar — Status-Dot, Farb-Kodierung |
| **Informationshierarchie** | iot-dashboard-design | Zone-Header → Sensoren → Aktoren → Dashboards; Subzone-Labels klar, nicht dominierend |
| **Accordion > Tabs** | iot-device-config-panel-ux | Subzone-Blöcke als Accordion; Grafana/Home Assistant Pattern |
| **40px Trennung** | iot-device-config-panel-ux (Grafana) | margin-bottom: var(--space-4) zwischen Major Sections |
| **Eine Information einmal** | iot-dashboard-design | Keine doppelte Zählung — eine klare Regel |
| **Hierarchisches Drill-Down** | iot-dashboard-design | Zone → Subzone → Sensor/Aktor; AWS IoT, ThingsBoard Pattern |
| **Farb-Kodierung** | iot-dashboard-design | Gruen/Gelb/Rot/Grau — OHNE Legende verständlich; ColorLegend.vue nutzen |
| **Glassmorphism** | Dashboard_analyse, UX-Audit | var(--glass-bg), var(--glass-border) — konsistent |
| **Accordion localStorage** | UX-Audit (Zone Accordion) | collapsedSubzones pro Zone: ao-monitor-subzone-collapse-${zoneId} |
| **Smart Defaults** | UX-Audit | ≤4 Subzonen: alle expanded; >4: nur erste expanded |

---

## 4. Implementierungs-Schritte (Reihenfolge)

### Phase 1: Backend (El Servador)

#### Schritt 1.1: Pydantic-Schemas

**Datei:** `El Servador/god_kaiser_server/src/schemas/monitor.py` (NEU)

```python
# Inhalt: SubzoneSensorEntry, SubzoneActuatorEntry, SubzoneGroup, ZoneMonitorData
# Siehe Integrationsvorschlag §3.1 — exaktes Schema
```

**Felder (Referenz):**
- `SubzoneSensorEntry`: esp_id, gpio, sensor_type, name, raw_value, unit, quality, last_read
- `SubzoneActuatorEntry`: esp_id, gpio, actuator_type, name, state, pwm_value, emergency_stopped
- `SubzoneGroup`: subzone_id (str | None für „Keine Subzone“), subzone_name, sensors[], actuators[]
- `ZoneMonitorData`: zone_id, zone_name, subzones[], sensor_count, actuator_count, alarm_count

#### Schritt 1.2: Service-Layer

**Datei:** `El Servador/god_kaiser_server/src/services/monitor_data_service.py` (NEU) ODER Erweiterung `zone_service.py`

**Logik:**
1. ESPs in Zone laden (zone_id aus esp_devices)
2. Pro ESP: SubzoneConfigs laden (subzone_configs)
3. Pro Subzone: assigned_gpios durchgehen → Sensor/Actuator-Configs zuordnen (esp_id + gpio)
4. Geräte ohne Subzone: GPIOs die in keiner subzone_configs.assigned_gpios vorkommen → SubzoneGroup(subzone_id=None, subzone_name="Keine Subzone")
5. Gruppierung: SubzoneGroup[] mit sensors[] und actuators[]
6. alarm_count: Sensoren mit quality in (critical, alarm) zählen

**Datenquellen:** esp_devices, subzone_configs, sensor_configs, actuator_configs, sensor_data (letzte Werte), actuator_configs (state, pwm_value)

#### Schritt 1.3: REST-Endpoint

**Datei:** `El Servador/god_kaiser_server/src/api/v1/zone.py`

**Änderung:** Neuer Endpoint
```python
@router.get("/{zone_id}/monitor-data", response_model=ZoneMonitorData)
async def get_zone_monitor_data(zone_id: str, ...):
    return await monitor_data_service.get_zone_monitor_data(zone_id)
```

**Registrierung:** Prüfen ob Router bereits `/zone` als Prefix hat; Pfad wird `GET /api/v1/zone/{zone_id}/monitor-data`

**Auth:** JWT (Active) — wie alle anderen Zone-Endpoints

#### Schritt 1.4: REST_ENDPOINTS.md aktualisieren

Neuen Endpoint dokumentieren: Methode, Pfad, Response-Schema, Auth

---

### Phase 2: Frontend — API & Datenfluss

#### Schritt 2.1: API-Modul

**Datei:** `El Frontend/src/api/zones.ts` ODER `El Frontend/src/api/monitor.ts` (NEU)

**Funktion:**
```typescript
export async function getZoneMonitorData(zoneId: string): Promise<ZoneMonitorData> {
  const { data } = await api.get<ZoneMonitorData>(`/zone/${zoneId}/monitor-data`)
  return data
}
```

**Types:** ZoneMonitorData, SubzoneGroup, SubzoneSensorEntry, SubzoneActuatorEntry in `src/types/` definieren (oder aus API-Response inferieren)

#### Schritt 2.2: useSubzoneResolver (Fallback)

**Datei:** `El Frontend/src/composables/useSubzoneResolver.ts` (NEU)

**Zweck:** Fallback wenn Monitor-Data-Endpoint fehlt. Lädt für alle ESPs in Zone die SubzoneConfigs, baut Map `(esp_id, gpio) → { subzoneId, subzoneName }`.

**Logik:**
1. espStore.devices nach zone_id filtern
2. Pro ESP: subzonesApi.getSubzones(espId)
3. Map aufbauen: für jede Subzone, für jeden gpio in assigned_gpios → key `${espId}-${gpio}` → value { subzoneId, subzoneName }
4. Return: Map<string, { subzoneId: string; subzoneName: string }>

#### Schritt 2.3: useZoneGrouping erweitern (Fallback)

**Datei:** `El Frontend/src/composables/useZoneGrouping.ts`

**Änderung:** Optionaler Parameter `subzoneResolver?: Map<string, { subzoneId: string; subzoneName: string }>`

In allSensors/allActuators: Statt `esp.subzone_id` → `const key = \`${espId}-${sensor.gpio}\`; const resolved = subzoneResolver?.get(key); subzoneId = resolved?.subzoneId ?? null`

**Hinweis:** Nur wenn Fallback-Pfad genutzt wird; primär nutzt MonitorView getZoneMonitorData.

---

### Phase 3: Frontend — MonitorView.vue Umstellung

#### Schritt 3.1: Datenquelle umstellen

**Datei:** `El Frontend/src/views/MonitorView.vue`

**Änderung:**
- `zoneMonitorData = ref<ZoneMonitorData | null>(null)`
- `watch([selectedZoneId], async ([zoneId]) => { if (!zoneId) return; try { zoneMonitorData.value = await getZoneMonitorData(zoneId) } catch { zoneMonitorData.value = null /* Fallback */ } }, { immediate: true })`
- Fallback: Wenn zoneMonitorData null (Endpoint fehlt/Fehler) → useZoneGrouping mit useSubzoneResolver

**Live-Werte:** Server liefert Struktur + Metadaten. Live-Werte (raw_value, quality, state) können aus espStore nach esp_id+gpio gemerged werden — ODER Server liefert bereits letzte Werte aus sensor_data/actuator_configs. **Pragmatisch:** Server liefert vollständige Daten (inkl. letzte Werte aus DB); WebSocket-Updates können später espStore aktualisieren, MonitorView reagiert auf zoneMonitorData.

#### Schritt 3.2: Template-Struktur (L2)

**Reihenfolge (auftrag-layout-monitor):**
1. Zone-Header (Name, KPIs, Alarm-Count)
2. Sensoren (Sektion)
3. Aktoren (Sektion)
4. Zone-Dashboards
5. Inline-Panels

**Sensoren-Sektion:**
```html
<section class="monitor-section">
  <h3>Sensoren ({{ zoneMonitorData?.sensor_count ?? 0 }})</h3>
  <div v-for="subzone in sensorSubzones" :key="subzone.subzone_id ?? 'none'">
    <!-- Subzone Accordion-Header + Content -->
  </div>
</section>
```

**sensorSubzones:** computed aus zoneMonitorData.subzones — nur Subzonen mit sensors.length > 0; „Keine Subzone“ nur wenn subzone_id === null und sensors.length > 0

#### Schritt 3.3: Zählungsregel umsetzen

| Ort | Vorher | Nachher |
|-----|--------|---------|
| Sektionsüberschrift | „Sensoren (5)“ | „Sensoren ({{ zoneMonitorData.sensor_count }})“ ✓ |
| Subzone-Header | „5 Sensoren“ | **Entfernen** — nur Name, Status-Dot, KPI-Werte |
| Zone-Header KPIs | Unverändert | ✓ |

**Keine Count-Badges** in Subzone-Headern.

#### Schritt 3.4: Subzone-Header (kompakter)

**Format:** `[Chevron] [Status-Dot] Subzone-Name    [23,5°C · 65% · 450ppm]`

- **Status-Dot:** getWorstQualityStatus(sensors) — bestehende Funktion nutzen
- **KPI-Werte:** getSubzoneKPIs(sensors) — max 3 Werte, kompakt (z.B. „23,5°C · 65% · 450ppm“)
- **Kein Count**

**Styling:** padding var(--space-2) var(--space-3), gap var(--space-2), margin-bottom var(--space-4) zwischen Sektionen (40px)

#### Schritt 3.5: Accordion-Verhalten

- **≤4 Subzonen:** Alle standardmäßig expanded
- **>4 Subzonen:** Nur erste expanded, Rest collapsed
- **localStorage:** `ao-monitor-subzone-collapse-${zoneId}` — JSON-Array der collapsed subzone_ids
- **Bestehende Logik:** collapsedSubzones, toggleSubzone, loadAccordionState — beibehalten, an neue Datenstruktur anpassen

#### Schritt 3.6: „Keine Subzone“

- **Label:** „Keine Subzone“ (eindeutig)
- **Bedingung:** Nur anzeigen wenn subzone_id === null und (sensors.length > 0 oder actuators.length > 0)
- **Visuell:** Gleiche Behandlung wie benannte Subzonen (Accordion, Glass-BG, Accent-Border)

#### Schritt 3.7: SensorCard / ActuatorCard Integration

**Unverändert:** SensorCard und ActuatorCard weiterverwenden. Props: Sensor/Aktor-Objekt mit esp_id, gpio, name, raw_value, quality, unit, etc. — aus ZoneMonitorData.SubzoneGroup.sensors/actuators.

**Grid:** monitor-card-grid — bestehende CSS-Klasse, gleiches Layout wie aktuell.

---

### Phase 4: Design-System Anpassungen

#### Schritt 4.1: Bestehende Primitives nutzen

| Element | Quelle | Verwendung |
|---------|--------|------------|
| Accordion | AccordionSection.vue ODER Custom in MonitorView | Subzone-Blöcke |
| Status-Dot | tokens.css --color-success/warning/error | Subzone-Header |
| Glass-BG | var(--glass-bg), var(--glass-border) | Subzone-Header |
| Typography | var(--text-base), var(--text-xs) | Hierarchie |
| Accent-Border | SubzoneArea.vue / ZonePlate | border-left: 3px solid var(--color-zone-{hash}) |

**Keine neuen Tokens** — nur bestehende nutzen.

#### Schritt 4.2: BEM-Konvention

**Klasse:** `monitor-subzone` (bereits vorhanden), `monitor-section`, `monitor-card-grid`

**Keine BEM-Violations** (vgl. UX-Audit DESIGN-002: zone-plate__chevron im Unassigned-Section vermeiden).

---

### Phase 5: Fallback & Fehlerbehandlung

#### Schritt 5.1: Fallback-Pfad

Wenn `getZoneMonitorData` 404 oder Fehler:
1. zoneMonitorData = null setzen
2. useZoneGrouping mit useSubzoneResolver(zoneId) nutzen
3. Gleiche UI-Struktur rendern — Daten kommen aus anderer Quelle

#### Schritt 5.2: Loading-State

- Skeleton oder Spinner während zoneMonitorData === null und selectedZoneId gesetzt
- Kein Flackern bei Zone-Wechsel

#### Schritt 5.3: Leere Zone

- zoneMonitorData.subzones = [] oder alle Subzonen leer → „Keine Sensoren/Aktoren in dieser Zone“ anzeigen
- EmptyState-Komponente nutzen (bereits vorhanden)

---

## 5. Konkrete Dateien-Checkliste

### Backend (El Servador)

| # | Datei | Aktion |
|---|-------|--------|
| 1 | `src/schemas/monitor.py` | NEU — ZoneMonitorData, SubzoneGroup, SubzoneSensorEntry, SubzoneActuatorEntry |
| 2 | `src/services/monitor_data_service.py` | NEU — get_zone_monitor_data(zone_id) |
| 3 | `src/api/v1/zone.py` | ERWEITERN — GET /{zone_id}/monitor-data |
| 4 | `src/api/v1/__init__.py` | Prüfen — Router bereits registriert |
| 5 | REST_ENDPOINTS.md | ERWEITERN — Neuer Endpoint |

### Frontend (El Frontend)

| # | Datei | Aktion |
|---|-------|--------|
| 1 | `src/api/zones.ts` oder `monitor.ts` | ERWEITERN/NEU — getZoneMonitorData |
| 2 | `src/types/monitor.ts` oder in zones | NEU — ZoneMonitorData, SubzoneGroup, etc. |
| 3 | `src/composables/useSubzoneResolver.ts` | NEU — Fallback GPIO→Subzone Map |
| 4 | `src/composables/useZoneGrouping.ts` | ERWEITERN — subzoneResolver optional (nur Fallback) |
| 5 | `src/views/MonitorView.vue` | ÄNDERN — Datenquelle, Zählung, Subzone-Header, „Keine Subzone“ |

### Keine Änderung

- SensorCard.vue, ActuatorCard.vue
- AccordionSection.vue (oder Custom-Accordion in MonitorView)
- tokens.css
- zone.store.ts, esp.store.ts
- subzonesApi, zonesApi (außer getZoneMonitorData hinzufügen)

---

## 6. Verifikation

### 6.1 Manuelle Tests

- [ ] Monitor L2: Zone mit Subzonen → Sensoren/Aktoren korrekt gruppiert
- [ ] Monitor L2: Zone mit „Keine Subzone“-Geräten → eigene Accordion-Gruppe
- [ ] Monitor L2: Keine doppelte Zählung
- [ ] Monitor L2: Subzone-Header ohne Count, mit KPI-Werten
- [ ] Fallback: Endpoint deaktivieren → useZoneGrouping+Resolver funktioniert
- [ ] L1 Zone-Zuweisung: Keine Regression

### 6.2 Build & Lint

- [ ] `npm run build` erfolgreich
- [ ] `vue-tsc --noEmit` fehlerfrei
- [ ] pytest (Backend) — neuer Endpoint getestet

---

## 7. Akzeptanzkriterien

- [ ] Monitor L2 zeigt Sensoren/Aktoren **korrekt nach Subzone gruppiert** (GPIO-basiert)
- [ ] **Keine doppelte Zählung** — nur Sektionsüberschrift „Sensoren (N)“ / „Aktoren (N)“
- [ ] Subzone-Header: Name, Status-Dot, KPI-Werte — **kein** Count
- [ ] „Keine Subzone“ nur angezeigt, wenn Geräte ohne Subzone-Zuordnung existieren
- [ ] Bestehende Patterns (AccordionSection, tokens.css, SensorCard, ActuatorCard) genutzt
- [ ] Ein klares Datenmodell: Server Monitor-Data primär, Fallback useZoneGrouping+Resolver
- [ ] Build erfolgreich, vue-tsc fehlerfrei
- [ ] Keine Duplikationen, keine Legacy — Integration nahtlos

---

## 8. Referenzen

| Dokument | Inhalt |
|----------|--------|
| `auftrag-monitor-l2-layout-integrationsvorschlag-2026-03-04.md` | Basis — Executive Summary, Backend-Schema, Frontend-Strategie |
| `zonen-subzonen-vollanalyse-bericht-2026-03-04.md` | B2, useZoneGrouping esp.subzone_id Problem |
| `auftrag-subzone-funktional-fix.md` | Voraussetzung B1, B2 |
| `auftrag-layout-monitor-seite-ueberschriften-reihenfolge.md` | Zählung, Reihenfolge |
| `wissen/iot-automation/iot-dashboard-design-best-practices-2026.md` | 5-Sekunden-Regel, Hierarchie, Farb-Kodierung |
| `wissen/iot-automation/iot-device-config-panel-ux-patterns.md` | Accordion, 40px Trennung |
| `arbeitsbereiche/automation-one/Dashboard_analyse.md` | Komponenten, Design-System |
| `.claude/agents/automation-experte.md` | UX-Audit, Wissensreferenz |
