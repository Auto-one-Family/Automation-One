# Frontend Dev Report: BUG-011 und BUG-012 Fix

## Modus: B (Implementierung)

## Auftrag
- BUG-011: Offline-Filter zeigt auch Online-Geräte innerhalb gefilterter Zonen (Unassigned-Sektion)
- BUG-012: Cross-ESP Button zeigt keine sichtbare Änderung beim Klick

## Codebase-Analyse

### Gelesene Dateien
- `El Frontend/src/views/HardwareView.vue` — vollständig (Zeilen 1-950+)
- `El Frontend/src/components/dashboard/ZonePlate.vue` — vollständig
- `El Frontend/src/composables/useZoneDragDrop.ts` — Zeilen 125-162 (groupDevicesByZone)
- `El Frontend/src/composables/useToast.ts` — vollständig

### BUG-011 Root Cause (gefunden)
Die ursprüngliche Vermutung war korrekt — aber der Fehler lag nicht in ZonePlate:

- `filteredEsps` (Zeile 245-272): filtert ESPs korrekt nach Status/Type
- `zoneGroups` (Zeile 274-302): nutzt `groupDevicesByZone(filteredEsps.value)` — korrekt
- `ZonePlate` bekommt `:devices="group.devices"` — korrekt gefilterte Devices
- `ZonePlate.vue` rendert ausschliesslich `props.devices` (kein direkter Store-Zugriff fuers Rendering)

**Eigentlicher Bug:** `unassignedDevices` (Zeile 305) wurde hardcoded auf `espStore.unassignedDevices` gesetzt
— das sind ALLE unzugewiesenen Devices, komplett am Filter vorbei. Der Unassigned-Bereich ignorierte
daher sowohl den Status-Filter als auch den Type-Filter.

### BUG-012 Root Cause (bestätigt)
- `showCrossEspConnections = ref(true)` war ein reiner UI-State ohne angebundenen Content
- Kein Panel/Overlay nutzte diesen State
- Button togglte visuell auf "aktiv" ohne sichtbare Auswirkung — irrefuehrend fuer den User

## Qualitaetspruefung (8-Dimensionen)

| # | Dimension | Status |
|---|-----------|--------|
| 1 | Struktur & Einbindung | HardwareView.vue — bestehende computed properties erweitert |
| 2 | Namenskonvention | camelCase-Funktionen, bestehende Pattern beibehalten |
| 3 | Rueckwaertskompatibilitaet | Nur interne computed-Logik geaendert, keine Props/Emits geaendert |
| 4 | Wiederverwendbarkeit | `filteredEsps` bereits vorhanden, nur Ableitung hinzugefuegt |
| 5 | Speicher & Ressourcen | Keine neue Reactivity, computed-Derivat von bestehendem computed |
| 6 | Fehlertoleranz | Fallback: wenn keine Filter aktiv -> `espStore.unassignedDevices` (Originalverhalten) |
| 7 | Seiteneffekte | `showCrossEspConnections` ref entfernt (war toter State), keine anderen Abhaengigkeiten |
| 8 | Industrielles Niveau | TypeScript strict, keine `any` eingefuehrt, minimale Aenderungen |

## Cross-Layer Impact
- Keine Server-API-Aenderungen
- Keine Store-Aenderungen (nur View-Logik)
- Keine Type-Aenderungen

## Implementierung

### Geaenderte Datei
`El Frontend/src/views/HardwareView.vue`

### BUG-011 Fix (2 Aenderungen)

1. `info` zu Toast-Destrukturierung hinzugefuegt (benoetigt fuer BUG-012):
```typescript
const { success: showSuccess, error: showError, info: showInfo } = useToast()
```

2. `unassignedDevices` computed umgestellt auf filterbasierte Ableitung:
```typescript
// VORHER
const unassignedDevices = computed(() => espStore.unassignedDevices)

// NACHHER
const unassignedDevices = computed(() => {
  const filters = dashStore.activeStatusFilters
  const filterType = dashStore.filterType
  // If no filters active, fall back to store source of truth
  if (filters.size === 0 && filterType === 'all') return espStore.unassignedDevices
  // Otherwise derive from filteredEsps to stay consistent with zone groups
  return filteredEsps.value.filter(d => !d.zone_id)
})
```

### BUG-012 Fix (2 Aenderungen)

3. Cross-ESP Button — active-class und Toggle entfernt, Info-Toast und Tooltip hinzugefuegt:
```html
<!-- VORHER -->
<button
  v-if="logicStore.crossEspConnections.length > 0"
  class="cross-esp-toggle"
  :class="{ 'cross-esp-toggle--active': showCrossEspConnections }"
  @click="showCrossEspConnections = !showCrossEspConnections"
>

<!-- NACHHER -->
<button
  v-if="logicStore.crossEspConnections.length > 0"
  class="cross-esp-toggle"
  :title="'Cross-ESP Visualisierung (demnächst verfügbar)'"
  @click="showInfo('Cross-ESP Visualisierung wird noch entwickelt')"
>
```

4. Tote Variable `showCrossEspConnections = ref(true)` entfernt (war Zeile 205).

## Verifikation

`npx vue-tsc --noEmit` zeigt ausschliesslich pre-existing Fehler in:
- `src/components/rules/RuleFlowEditor.vue` (2 Fehler — VueFlow Node-Typ-Konvertierung)
- `src/views/SensorHistoryView.vue` (2 Fehler — Chart.js Scales-Typen)

Keine neuen Fehler durch meine Aenderungen eingefuehrt.

## Empfehlung

Die pre-existing Build-Fehler in `RuleFlowEditor.vue` und `SensorHistoryView.vue` sollten separat
behoben werden um den Build wieder zu aktivieren.
