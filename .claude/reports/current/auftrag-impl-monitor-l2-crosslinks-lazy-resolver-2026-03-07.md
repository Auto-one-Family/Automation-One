# Auftrag: Monitor L2 Verfeinerung — HardwareView-Link + Lazy Resolver

> **Erstellt:** 2026-03-07
> **Ziel-Repo:** auto-one
> **Typ:** Implementierung (2 Items, beruehrt MonitorView.vue + useSubzoneResolver.ts)
> **Prioritaet:** MITTEL — Optimierung, nicht blockierend
> **Aufwand:** ~1.5h gesamt
> **Abhaengigkeit:** Phase 0 + Phase 1 + Phase 3 muessen ERLEDIGT sein
> **Kann parallel laufen zu:** `auftrag-impl-monitor-l2-debounce-accordion-stale-2026-03-07.md`
> **Grundlage:** Analyse-Report `PHASE23_PHASE4_ANALYSE_MONITOR_L2_VERFEINERUNG_2026-03-07.md`

---

## Systemkontext

AutomationOne hat 3 Schichten: **El Trabajante** (ESP32 Firmware), **El Servador** (FastAPI Backend), **El Frontend** (Vue 3 + TypeScript). Dieser Auftrag betrifft ausschliesslich **El Frontend**.

### Monitor L2 = Read-Only Zone-Detail-Ansicht

Route: `/monitor/:zoneId`. Zeigt Sensoren und Aktoren einer Zone in Subzone-Accordions. Monitor = Beobachten + Verstehen.

### Relevante Dateien

| Datei | Pfad | Rolle |
|-------|------|-------|
| MonitorView.vue | `El Frontend/src/views/MonitorView.vue` | Hauptdatei — L1 + L2 in einer View |
| useSubzoneResolver.ts | `El Frontend/src/composables/useSubzoneResolver.ts` | Subzone-Aufloesung per ESP (93 Zeilen) |
| router/index.ts | `El Frontend/src/router/index.ts` | Route-Definitionen (nur lesen, nicht aendern) |

---

## Was NICHT gemacht wird

- Keine Backend-Aenderungen
- Keine neuen Dateien erstellen
- Keine Router-Aenderungen (Route `/hardware/:zoneId` existiert bereits)
- Keine Aenderungen an SensorCard.vue, ActuatorCard.vue, logic.store.ts
- Kein Refactoring von bestehendem funktionierendem Code
- useSubzoneResolver wird NICHT entfernt — nur auf lazy umgestellt

---

## Item 1: HardwareView-Link im Zone-Header (Phase 4.2) — ~30min

### Problem

Auf Monitor L2 gibt es keinen direkten Link zur HardwareView fuer die angezeigte Zone. Der Workflow "Ich sehe im Monitor dass etwas nicht stimmt → ich will die Hardware-Konfiguration anpassen" erfordert aktuell mehrere Klicks ueber Umwege (SensorsView/Wissensdatenbank). Ein Zahnrad-Icon im Zone-Header wuerde diesen Workflow auf einen Klick reduzieren.

### IST-Zustand (verifiziert)

**Zone-Header in MonitorView.vue (ca. Zeile 1701-1745):**

Der Header ist ein Flexbox-Container mit folgenden Elementen:

| Position | Element | Beschreibung |
|----------|---------|-------------|
| Links | Zurueck-Button | ArrowLeft Icon → `router.push({ name: 'monitor' })` |
| Mitte | Zone-Navigation | Prev/Next mit ChevronLeft/Right (nur bei >1 Zone) |
| Mitte | Zone-Name | `{{ selectedZoneName }} ({{ zonePositionLabel }})` |
| Rechts | KPI-Zeile | Sensoren/Aktoren/Alarme Counts |
| **FEHLT** | **Settings-Link** | **Kein Link zu HardwareView** |

**Route `/hardware/:zoneId`:** EXISTIERT als `hardware-zone` (router/index.ts Zeile 67-84).

**Icon-Library:** `lucide-vue-next` v0.468.0. `Settings` Icon verfuegbar aber noch nicht in MonitorView importiert.

**Aktuell importierte Icons (MonitorView.vue ca. Zeile 63-64):**
```typescript
import { ArrowLeft, Activity, AlertTriangle, ChevronLeft, ChevronRight, ... } from 'lucide-vue-next'
```

### SOLL

Ein Zahnrad-Icon (`Settings` aus lucide-vue-next) erscheint im Zone-Header als Link zur HardwareView der aktuellen Zone. Position: Rechts im Header-Bereich, als letztes Element. Tooltip: "Hardware-Konfiguration". Klick navigiert zu `/hardware/:zoneId`.

### Implementierung

**Schritt 1a:** `Settings` Icon zum Import hinzufuegen:

```typescript
// MonitorView.vue ca. Zeile 63-64 — Settings zum bestehenden Import hinzufuegen
import { ArrowLeft, Activity, AlertTriangle, ChevronLeft, ChevronRight, Settings, ... } from 'lucide-vue-next'
```

**Schritt 1b:** Router-Link im Zone-Header einfuegen. Position: Nach dem letzten Element im Header-Container (nach der KPI-Zeile, ca. Zeile 1744), aber INNERHALB des Header-`<div>`:

```vue
<!-- HardwareView-Link — nach KPI-Zeile, innerhalb des Headers -->
<router-link
  v-if="selectedZoneId"
  :to="{ name: 'hardware-zone', params: { zoneId: selectedZoneId } }"
  class="monitor-view__config-link"
  title="Hardware-Konfiguration"
>
  <Settings :size="16" />
</router-link>
```

**Schritt 1c:** CSS im `<style scoped>` Block:

```css
.monitor-view__config-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-secondary);
  background: var(--glass-bg, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
  transition: all 0.15s ease;
  margin-left: auto;
  text-decoration: none;
  flex-shrink: 0;
}

.monitor-view__config-link:hover {
  color: var(--color-text-primary);
  background: var(--glass-bg-hover, rgba(255, 255, 255, 0.1));
  border-color: var(--glass-border-hover, rgba(255, 255, 255, 0.2));
}

.monitor-view__config-link:focus-visible {
  outline: 2px solid var(--color-iridescent-2, #60a5fa);
  outline-offset: 2px;
}
```

**Hinweis zum CSS:** Die CSS-Variablen (`--glass-bg`, `--glass-border`, `--color-iridescent-2`) sind Konventionen aus dem AutomationOne Design-System. Falls die exakten Variablen-Namen anders sind, die tatsaechlichen Namen aus dem Projekt verwenden. Die Glassmorphism-Optik (halbtransparenter Hintergrund, subtiler Border) passt zum bestehenden UI-Stil.

### Akzeptanzkriterien

- [ ] Zahnrad-Icon ist im Zone-Header auf Monitor L2 sichtbar
- [ ] Icon ist nur sichtbar wenn `selectedZoneId` vorhanden ist (nicht auf L1)
- [ ] Klick navigiert zu `/hardware/:zoneId` mit der richtigen zoneId
- [ ] Hover-Effekt vorhanden (Farbwechsel, Hintergrund-Aufhellung)
- [ ] Focus-visible Outline fuer Keyboard-Navigation
- [ ] Icon stoert das bestehende Header-Layout nicht (kein Overflow, kein Umbruch bei Normalbreite)
- [ ] Tooltip "Hardware-Konfiguration" wird bei Hover angezeigt (via `title` Attribut)

---

## Item 2: Lazy Resolver (Phase 4.3) — ~1h

### Problem

Beim Oeffnen einer Zone auf Monitor L2 wird `useSubzoneResolver` automatisch initialisiert. Der Resolver macht **pro ESP** einen separaten API-Call zu `GET /subzone/devices/{espId}/subzones` — bei einer Zone mit 5 ESPs sind das **5 sequentielle API-Calls** (await in for-Loop). Diese Calls sind **redundant** wenn der primaere Endpoint `GET /zone/{zone_id}/monitor-data` erfolgreich antwortet — der Resolver wird nur als Fallback gebraucht.

**Gemessene Kosten:** ~100-500ms pro Call = 500-2500ms total fuer 5 ESPs. Das sind verschwendete API-Calls in ~95% der Faelle (API-Fehler sind selten).

### IST-Zustand (verifiziert)

**useSubzoneResolver.ts (93 Zeilen):**

```typescript
// ca. Zeile 20-25
export function useSubzoneResolver(zoneIdRef: Ref<string | null>) {
  const resolverMap = ref<Map<string, SubzoneResolved>>(new Map())
  const isLoading = ref(false)
  const error = ref<Error | null>(null)

  // ca. Zeile 37-67
  async function buildResolver() {
    // ... laedt ESPs fuer Zone, dann pro ESP:
    for (const esp of esps) {
      const subzones = await subzonesApi.getSubzones(esp.device_id)
      // ... baut resolverMap auf: "${espId}-${gpio}" → { subzoneId, subzoneName }
    }
  }

  // ca. Zeile 79-85 — Auto-Trigger
  watch(
    [zoneIdRef, () => devicesInZone.value.length],
    () => { buildResolver() },
    { immediate: true }
  )

  return { resolverMap, isLoading, error, buildResolver }
}
```

**Nutzung in MonitorView.vue:**

```typescript
// ca. Zeile 117
const subzoneResolver = useSubzoneResolver(selectedZoneId)
```

**Datenfluss-Entscheidung (ca. Zeile 1073-1098):**
```typescript
const zoneSensorGroup = computed(() => {
  const data = zoneMonitorData.value
  if (data && !zoneMonitorError.value) {
    // API-Daten nutzen → Resolver wird NICHT gebraucht
    return mapApiDataToZoneGroup(data)
  }
  // Fallback auf useZoneGrouping mit Resolver
  return sensorsByZone.value  // ← hier wird Resolver genutzt
})
```

**Fazit:** Der Resolver wird NUR im Fallback-Pfad gebraucht. Bei erfolgreichem API-Call sind alle seine Daten redundant. Trotzdem startet er sofort bei jedem Zone-Wechsel.

**Andere Views die useSubzoneResolver nutzen:** KEINE (Codebase-Suche: nur MonitorView importiert es).

### SOLL

Der Resolver wird "lazy" gemacht: Er startet seine API-Calls NICHT automatisch bei Zone-Wechsel, sondern nur wenn der primaere `monitor-data` Endpoint fehlschlaegt. Das spart ~5 API-Calls pro Zone-Wechsel.

### Implementierung

**Schritt 2a:** `useSubzoneResolver.ts` — `lazy` Option hinzufuegen:

```typescript
interface SubzoneResolverOptions {
  lazy?: boolean  // Default: false (backward-kompatibel)
}

export function useSubzoneResolver(
  zoneIdRef: Ref<string | null>,
  options: SubzoneResolverOptions = {}
) {
  const resolverMap = ref<Map<string, SubzoneResolved>>(new Map())
  const isLoading = ref(false)
  const error = ref<Error | null>(null)

  // ... devicesInZone, buildResolver() — unveraendert ...

  // Auto-Trigger NUR wenn nicht lazy
  if (!options.lazy) {
    watch(
      [zoneIdRef, () => devicesInZone.value.length],
      () => { buildResolver() },
      { immediate: true }
    )
  }

  return { resolverMap, isLoading, error, buildResolver }
}
```

**Warum Interface statt boolean-Parameter:** Erweiterbar fuer zukuenftige Optionen, selbstdokumentierend am Aufrufpunkt (`{ lazy: true }` statt `true`).

**Schritt 2b:** MonitorView.vue — Resolver auf lazy umstellen:

```typescript
// ca. Zeile 117 — aendern:
// VORHER:
const subzoneResolver = useSubzoneResolver(selectedZoneId)

// NACHHER:
const subzoneResolver = useSubzoneResolver(selectedZoneId, { lazy: true })
```

**Schritt 2c:** MonitorView.vue — Resolver bei API-Error triggern. Neuer Watch NACH dem bestehenden `fetchZoneMonitorData()` Watch (ca. Zeile 1235):

```typescript
// Lazy Resolver: Nur bei API-Error starten
watch(zoneMonitorError, (error) => {
  if (error && selectedZoneId.value) {
    subzoneResolver.buildResolver()
  }
})
```

**Schritt 2d (optional aber empfohlen):** `buildResolver()` parallelisieren statt sequentiell. Aktuell: `for (const esp of esps) { await subzonesApi.getSubzones(esp.device_id) }` — sequentiell, langsam. Besser: `Promise.all()`.

```typescript
// In useSubzoneResolver.ts, innerhalb buildResolver():

// VORHER (sequentiell):
for (const esp of esps) {
  const subzones = await subzonesApi.getSubzones(esp.device_id)
  // ... resolverMap aufbauen ...
}

// NACHHER (parallel):
const results = await Promise.all(
  esps.map(async (esp) => ({
    espId: esp.device_id,
    subzones: await subzonesApi.getSubzones(esp.device_id)
  }))
)

for (const { espId, subzones } of results) {
  // ... resolverMap aufbauen (gleiche Logik wie bisher) ...
}
```

**Vorteil:** Bei 5 ESPs: 1x Latenz statt 5x Latenz. Wichtig fuer den Error-Fallback wo der User bereits wartet.

**Risiko:** `Promise.all` failt wenn ein einzelner ESP-Call fehlschlaegt. Loesung: `Promise.allSettled` verwenden und fehlgeschlagene Calls loggen aber ignorieren.

```typescript
const results = await Promise.allSettled(
  esps.map(async (esp) => ({
    espId: esp.device_id,
    subzones: await subzonesApi.getSubzones(esp.device_id)
  }))
)

for (const result of results) {
  if (result.status === 'fulfilled') {
    const { espId, subzones } = result.value
    // ... resolverMap aufbauen ...
  }
  // rejected: skip silently (einzelner ESP nicht erreichbar)
}
```

### Wie verifizieren

1. **DevTools Network Tab:** Zone oeffnen → es sollte NUR `GET /zone/{zoneId}/monitor-data` aufgerufen werden, KEINE `GET /subzone/devices/{espId}/subzones` Calls
2. **Fehlersimulation:** Backend voruebergehend stoppen oder `monitor-data` Endpoint mit Error-Response testen → dann sollten die Subzone-Calls starten
3. **Fallback-Anzeige:** Bei API-Error muss die Zone trotzdem Subzone-Daten zeigen (aus dem Resolver)

### Akzeptanzkriterien

- [ ] Zone-Wechsel auf L2 loest KEINE `GET /subzone/devices/{espId}/subzones` Calls aus (verifiziert via DevTools)
- [ ] `GET /zone/{zoneId}/monitor-data` wird weiterhin aufgerufen (unveraendert)
- [ ] Bei API-Error von `monitor-data`: Resolver startet automatisch und Fallback-Daten werden angezeigt
- [ ] Bestehende Views die useSubzoneResolver NICHT-lazy nutzen (falls vorhanden): unveraendert
- [ ] Optional: `buildResolver()` nutzt `Promise.allSettled` statt sequentielle awaits
- [ ] Keine TypeScript-Fehler
- [ ] Bestehende Tests laufen gruen

---

## Reihenfolge der Implementierung

```
1. Item 1 (HardwareView-Link)  — ~30min, trivial, keine Abhaengigkeiten
2. Item 2 (Lazy Resolver)      — ~1h, groessere Aenderung, 2 Dateien
```

Item 1 kann zuerst implementiert werden weil es voellig unabhaengig ist und schnell erledigt ist. Item 2 ist die substanziellere Aenderung und sollte sorgfaeltig getestet werden (Network Tab Verifikation).

---

## Gesamte Akzeptanzkriterien

- [ ] Alle Einzelkriterien der 2 Items erfuellt
- [ ] Bestehende Tests laufen weiterhin gruen (keine Regression)
- [ ] Keine TypeScript-Fehler (`npm run type-check`)
- [ ] Keine neuen Dateien erstellt
- [ ] Aenderungen beschraenkt auf: MonitorView.vue, useSubzoneResolver.ts
- [ ] Router-Definitionen NICHT veraendert
- [ ] L2 Monitor ist weiterhin vollstaendig Read-Only
- [ ] Visueller Test: Zahnrad-Icon im Zone-Header sichtbar und klickbar
- [ ] Network-Test: Zone-Wechsel macht keine redundanten Subzone-API-Calls
