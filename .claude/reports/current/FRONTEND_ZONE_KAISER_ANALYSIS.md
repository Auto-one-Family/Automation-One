# Frontend Dev Report: Zone/Kaiser/Subzone Implementierung Analyse

## Modus: A (Analyse/Plan)
## Auftrag: Frontend-Implementierung analysieren im Kontext des server-side Analyse-Dokuments
## Datum: 2026-02-10

---

## Executive Summary

Das Frontend hat eine **vollständige Zone-Implementierung**, aber **KEINE Subzone-UI** und **KEINE Kaiser-UI**. Die Implementierung ist sauber, pattern-konform und bereit für Erweiterungen.

### Implementierungsstatus

| Feature | API-Client | Types | UI-Components | Composables | WebSocket | Status |
|---------|-----------|-------|---------------|-------------|-----------|--------|
| **Zone Assignment** | ✅ Complete | ✅ Complete | ✅ Complete | ✅ Complete | ✅ Complete | **PRODUCTION READY** |
| **Subzone Management** | ✅ Complete | ✅ Complete | ❌ Missing | ❌ Missing | ⚠️ Partial | **API READY, NO UI** |
| **Kaiser Hierarchy** | ❌ Missing | ⚠️ Partial | ❌ Missing | ❌ Missing | ❌ Missing | **NOT IMPLEMENTED** |

---

## Codebase-Analyse

### 1. Zone API Client (`api/zones.ts`) - 85 Zeilen

**Vollständigkeit:** ✅ Complete - Pattern-konform

| Funktion | Zeilen | HTTP | Endpoint | Beschreibung |
|----------|--------|------|----------|--------------|
| `assignZone()` | 21-30 | POST | `/zone/devices/{id}/assign` | Zone zuweisen (DB + MQTT) |
| `removeZone()` | 37-42 | DELETE | `/zone/devices/{id}/zone` | Zone entfernen |
| `getZoneInfo()` | 47-50 | GET | `/zone/devices/{id}` | Zone-Info für ESP |
| `getZoneDevices()` | 55-58 | GET | `/zone/{zoneId}/devices` | Alle ESPs einer Zone |
| `getUnassignedDevices()` | 63-66 | GET | `/zone/unassigned` | ESPs ohne Zone |

**Findings:**
- ✅ Nutzt TypeScript Interfaces aus `@/types`
- ✅ Folgt REST-Pattern aus anderen API-Clients
- ✅ Error-Handling liegt in Store/Composable (korrekt)
- ⚠️ **KEINE Kaiser-Endpoints** (weder `kaiser_id` noch `/kaiser/*`)
- ✅ `assignZone()` akzeptiert `master_zone_id` (für Kaiser, aber nicht dokumentiert)

**Code-Referenz: assignZone() Request-Struktur**
```typescript
// Zeile 21-30
interface ZoneAssignRequest {
  zone_id: string
  zone_name?: string
  master_zone_id?: string  // ← Kaiser-Field vorhanden aber nicht genutzt
}
```

---

### 2. Subzone API Client (`api/subzones.ts`) - 155 Zeilen

**Vollständigkeit:** ✅ Complete API - Pattern-konform - **ABER: KEINE UI**

| Funktion | Zeilen | HTTP | Endpoint | Beschreibung |
|----------|--------|------|----------|--------------|
| `assignSubzone()` | 40-49 | POST | `/subzone/devices/{id}/subzones/assign` | Subzone zuweisen |
| `removeSubzone()` | 61-69 | DELETE | `/subzone/devices/{id}/subzones/{subzoneId}` | Subzone entfernen |
| `getSubzones()` | 81-86 | GET | `/subzone/devices/{id}/subzones` | Alle Subzones eines ESP |
| `getSubzone()` | 95-100 | GET | `/subzone/devices/{id}/subzones/{subzoneId}` | Einzelne Subzone |
| `enableSafeMode()` | 117-128 | POST | `/subzone/.../safe-mode` | Safe-Mode aktivieren |
| `disableSafeMode()` | 141-152 | DELETE | `/subzone/.../safe-mode` | Safe-Mode deaktivieren |

**Findings:**
- ✅ **API komplett implementiert** - alle CRUD-Operationen
- ✅ Safe-Mode Control vorhanden
- ✅ JSDoc-Kommentare detailliert
- ⚠️ **KEINE Subzone-UI-Komponenten** im gesamten Frontend
- ⚠️ **KEINE Composables** für Subzone-Drag&Drop
- ⚠️ **KEINE Integration** in ZoneGroup oder ESPCard

**Code-Referenz: Subzone Assignment**
```typescript
// Zeile 40-49
interface SubzoneAssignRequest {
  subzone_id: string
  subzone_name?: string
  parent_zone_id?: string
  assigned_gpios: number[]  // ← GPIO-Level Granularität
  safe_mode_active?: boolean
}
```

---

### 3. ZoneAssignmentPanel Component (`components/zones/ZoneAssignmentPanel.vue`) - 590 Zeilen

**Vollständigkeit:** ✅ Complete Zone UI - Production Quality

| Feature | Zeilen | Beschreibung |
|---------|--------|--------------|
| **Props** | 210-221 | `espId`, `currentZoneId`, `currentZoneName`, `currentMasterZoneId`, `isMock`, `compact` |
| **State Machine** | 230-306 | `idle`, `sending`, `pending_ack`, `success`, `timeout`, `error` |
| **Zone-ID Generation** | 258-268 | `generateZoneId()` - Umlauts, lowercase, underscores |
| **WebSocket ACK Watch** | 280-306 | Wartet auf ESP-Bestätigung via WebSocket |
| **Optimistic Update** | 348-353 | `espStore.updateDeviceZone()` sofort nach API-Call |
| **30s Timeout** | 361-374 | Falls ESP nicht antwortet |

**Findings:**
- ✅ **Exzellente State Machine** - UX wie Industriestandard
- ✅ **Optimistic Updates** - UI reagiert sofort
- ✅ **WebSocket-Integration** - wartet auf ESP-ACK
- ✅ **Zone-ID Auto-Generation** - User gibt nur Namen ein
- ✅ **Compact Mode** - für Embedding in Popovers
- ⚠️ **Kaiser (`master_zone_id`) wird akzeptiert aber NICHT in UI gezeigt**
- ❌ **KEINE Subzone-UI** - weder Anzeige noch Assignment

**Code-Referenz: Zone-ID Generation**
```typescript
// Zeile 258-268
function generateZoneId(zoneName: string): string {
  if (!zoneName) return ''
  let zoneId = zoneName.toLowerCase()
  // "Gewächshaus Nord" → "gewaechshaus_nord"
  zoneId = zoneId.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
  zoneId = zoneId.replace(/[^a-z0-9]+/g, '_')
  zoneId = zoneId.replace(/^_+|_+$/g, '')
  return zoneId
}
```

**Code-Referenz: Optimistic Update + WebSocket ACK**
```typescript
// Zeile 348-389
// 1. Optimistic Update (sofort)
espStore.updateDeviceZone(props.espId, { zone_id, zone_name, master_zone_id })

// 2. State: pending_ack (falls MQTT)
if (response.mqtt_sent && !props.isMock) {
  assignmentState.value = 'pending_ack'

  // 3. Timeout nach 30s
  ackTimeoutId.value = setTimeout(() => {
    assignmentState.value = 'timeout'
    errorMessage.value = 'ESP hat nicht bestätigt...'
  }, 30000)
}

// 4. WebSocket Watch detektiert ESP-ACK (Zeile 283-306)
watch(() => props.currentZoneId, (newZoneId) => {
  if (assignmentState.value === 'pending_ack' && newZoneId === generatedZoneId.value) {
    clearTimeout(ackTimeoutId.value)
    assignmentState.value = 'success'
  }
})
```

---

### 4. ZoneGroup Component (`components/zones/ZoneGroup.vue`) - 921 Zeilen

**Vollständigkeit:** ✅ Complete Drag&Drop - VueDraggable Integration

| Feature | Zeilen | Beschreibung |
|---------|--------|--------------|
| **VueDraggable** | 435-463 | `group="esp-devices"`, `force-fallback`, `handle=".esp-drag-handle"` |
| **Drag Events** | 161-303 | `@add`, `@start`, `@end`, `@choose`, `@unchoose` |
| **LocalStorage Collapse** | 76-96 | Zone-Zustand persistent |
| **Empty State** | 490-504 | Drop-Target für leere Zones |
| **Unassigned Zone** | 122, 142 | `isUnassigned` Prop - spezielle Styling |
| **Stats Header** | 112-114 | "X ESPs • Y Online" |

**Findings:**
- ✅ **VueDraggable + force-fallback** - verhindert native Drag-Konflikte
- ✅ **Drag-Handle Pattern** - nur Header ist draggable
- ✅ **Native Drag Prevention** (Zeile 316-337) - für Satellite-Drags (Chart)
- ✅ **Empty Drop-Target** - Zone bleibt sichtbar auch ohne Devices
- ✅ **Unassigned Zone Special** - Warning-Styling
- ⚠️ **KEINE Subzone-Anzeige** - nur Zone-Level
- ⚠️ **KEINE Kaiser-Hierarchie** - flat zone list

**Code-Referenz: Native Drag Prevention**
```typescript
// Zeile 316-337 - Kritisch für Chart-Drag-Funktion!
function handleNativeDragStart(event: DragEvent) {
  const isSatelliteDrag = target.closest('[data-satellite-type]')

  if (isSatelliteDrag) {
    // Satellite-Drag für Chart - durchlassen
    return
  }

  // Alle anderen native Drags blockieren
  // VueDraggable nutzt Mouse Events (force-fallback)
  event.preventDefault()
  event.stopPropagation()
}
```

---

### 5. useZoneDragDrop Composable (`composables/useZoneDragDrop.ts`) - 513 Zeilen

**Vollständigkeit:** ✅ Complete - Industriestandard Drag&Drop Logic

| Feature | Zeilen | Beschreibung |
|---------|--------|--------------|
| **ZONE_UNASSIGNED Constant** | 22 | `'__unassigned__'` - Export für Konsistenz |
| **Zone-ID ↔ Name Konversion** | 84-107 | Bidirektional |
| **groupDevicesByZone()** | 127-162 | Zone-Grouping mit IMMER vorhandenem Unassigned |
| **handleDeviceDrop()** | 186-264 | Assign + API + Toast + History |
| **handleRemoveFromZone()** | 270-343 | Remove + API + Toast + History |
| **Undo/Redo System** | 70-73, 349-477 | Max 20 Einträge, Stack-basiert |

**Findings:**
- ✅ **Undo/Redo** - vorhanden und funktionsfähig (max 20 Einträge)
- ✅ **Optimistic Update via Store** - kein direktes Fetch, Store-Method
- ✅ **History Stack** - `pushToHistory()` bei jedem Drop
- ✅ **Error-Handling mit Retry** - Toast mit "Erneut versuchen" Action
- ⚠️ **KEINE Subzone-Funktionen** - nur Zone-Level
- ⚠️ **KEINE Kaiser-Logik** - `master_zone_id` wird nicht verwendet

**Code-Referenz: Undo/Redo System**
```typescript
// Zeile 70-73, 111-120
const undoStack = ref<ZoneHistoryEntry[]>([])
const redoStack = ref<ZoneHistoryEntry[]>([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

function pushToHistory(entry: ZoneHistoryEntry) {
  undoStack.value.push(entry)
  if (undoStack.value.length > MAX_HISTORY) {
    undoStack.value.shift()
  }
  redoStack.value = []  // Clear redo on new action
}
```

**Code-Referenz: Zone-ID ↔ Name Konversion**
```typescript
// Zeile 84-107
// Display: "zelt_1" → "Zelt 1"
function zoneIdToDisplayName(zoneId: string): string {
  return zoneId.split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Technical: "Zelt 1" → "zelt_1"
function generateZoneId(zoneName: string): string {
  let zoneId = zoneName.toLowerCase()
  zoneId = zoneId.replace(/ä/g, 'ae').replace(/ö/g, 'oe')
  zoneId = zoneId.replace(/[^a-z0-9]+/g, '_')
  return zoneId.replace(/^_+|_+$/g, '')
}
```

---

## Type-System Analyse

### Zone Types (`types/index.ts`)

| Interface | Zeilen | Felder | Verwendung |
|-----------|--------|--------|------------|
| `ZoneAssignRequest` | 845-849 | `zone_id`, `zone_name?`, `master_zone_id?` | API Request |
| `ZoneAssignResponse` | 854-863 | `success`, `device_id`, `zone_id`, `mqtt_sent`, ... | API Response |
| `ZoneRemoveResponse` | 868-874 | `success`, `device_id`, `mqtt_topic`, `mqtt_sent` | API Response |
| `ZoneInfo` | 879-885 | `zone_id`, `zone_name`, `master_zone_id`, `is_zone_master`, `kaiser_id` | Display Info |

**Findings:**
- ✅ `master_zone_id` in `ZoneAssignRequest` - bereit für Kaiser
- ✅ `kaiser_id` in `ZoneInfo` - bereit für Kaiser-Anzeige
- ⚠️ **`is_zone_master` field** - für Kaiser-Detection, aber nicht genutzt
- ⚠️ **KEIN Kaiser-Create/Update Interface** - nur Lesezugriff vorbereitet

### Subzone Types (`types/index.ts`)

| Interface | Zeilen | Felder | Verwendung |
|-----------|--------|--------|------------|
| `SubzoneInfo` | 906-915 | `subzone_id`, `parent_zone_id`, `assigned_gpios[]`, `safe_mode_active` | Display |
| `SubzoneAssignRequest` | 920-926 | `subzone_id`, `assigned_gpios[]`, `safe_mode_active?` | API Request |
| `SubzoneAssignResponse` | 931-939 | `success`, `device_id`, `subzone_id`, `mqtt_sent` | API Response |
| `SubzoneRemoveResponse` | 944-951 | `success`, `device_id`, `subzone_id`, `mqtt_sent` | API Response |
| `SubzoneListResponse` | 956-963 | `device_id`, `zone_id`, `subzones[]`, `total_count` | List Response |

**Findings:**
- ✅ **Komplettes Type-System** für Subzones
- ✅ `assigned_gpios[]` - GPIO-Level Granularität
- ✅ `safe_mode_active` - Safety-Feature
- ✅ `parent_zone_id` - Zone-Subzone-Relation

### WebSocket Event Types (`types/websocket-events.ts`)

| Event Interface | Zeilen | Data Felder | Trigger |
|----------------|--------|-------------|---------|
| `ZoneAssignmentEvent` | 578-588 | `esp_id`, `zone_id`, `zone_name?`, `status`, `error_code?` | ESP-ACK |

**Findings:**
- ✅ Zone-Assignment Event vorhanden
- ❌ **KEIN SubzoneAssignmentEvent** - Subzone-ACKs fehlen
- ❌ **KEIN KaiserEvent** - Kaiser-Updates fehlen

---

## Cross-Layer Impact

### ✅ Vorhanden (Zone)

| Layer | Implementierung | Status |
|-------|----------------|--------|
| API-Client | `api/zones.ts` | ✅ Complete |
| Types | `types/index.ts` | ✅ Complete |
| UI-Component | `ZoneAssignmentPanel.vue` | ✅ Complete |
| Composable | `useZoneDragDrop.ts` | ✅ Complete |
| WebSocket | `zone_assignment` Event | ✅ Complete |
| Store | `espStore.updateDeviceZone()` | ✅ Complete |

### ⚠️ Teilweise (Subzone)

| Layer | Implementierung | Status |
|-------|----------------|--------|
| API-Client | `api/subzones.ts` | ✅ Complete |
| Types | `types/index.ts` | ✅ Complete |
| UI-Component | — | ❌ Missing |
| Composable | — | ❌ Missing |
| WebSocket | — | ❌ Missing |
| Store | — | ❌ Missing |

### ❌ Fehlend (Kaiser)

| Layer | Implementierung | Status |
|-------|----------------|--------|
| API-Client | — | ❌ Missing |
| Types | Partial (`kaiser_id`, `is_zone_master`) | ⚠️ Partial |
| UI-Component | — | ❌ Missing |
| Composable | — | ❌ Missing |
| WebSocket | — | ❌ Missing |
| Store | — | ❌ Missing |

---

## Qualitätsprüfung (8-Dimensionen-Checkliste)

### Dimension 1: Struktur & Einbindung ✅
- ✅ API-Clients in `api/zones.ts`, `api/subzones.ts`
- ✅ Components in `components/zones/`
- ✅ Composable in `composables/useZoneDragDrop.ts`
- ✅ Types in `types/index.ts`, `types/websocket-events.ts`
- ✅ @/ Imports konsistent

### Dimension 2: Namenskonvention ✅
- ✅ PascalCase für Komponenten (`ZoneGroup`, `ZoneAssignmentPanel`)
- ✅ camelCase für Funktionen (`assignZone`, `handleDeviceDrop`)
- ✅ camelCase mit `use` für Composables (`useZoneDragDrop`)
- ✅ PascalCase für Interfaces (`ZoneAssignRequest`)
- ✅ UPPER_SNAKE für Konstanten (`ZONE_UNASSIGNED`)

### Dimension 3: Rückwärtskompatibilität ✅
- ✅ API-Endpoints folgen Server REST-Pattern
- ✅ Keine Breaking Changes in Types
- ⚠️ **`master_zone_id` wird akzeptiert aber nicht genutzt** - Forward-Compatible

### Dimension 4: Wiederverwendbarkeit ✅
- ✅ `useZoneDragDrop` Composable - wiederverwendbar
- ✅ `ZONE_UNASSIGNED` Konstante exportiert
- ✅ `generateZoneId()` / `zoneIdToDisplayName()` - utility functions
- ✅ `ZoneAssignmentPanel` mit `compact` Mode - embedding-ready

### Dimension 5: Speicher & Ressourcen ✅
- ✅ `onUnmounted` Cleanup für Timeouts (`ackTimeoutId`)
- ✅ WebSocket-Subscriptions mit Unsubscribe-Array
- ✅ LocalStorage für Collapse-State (effizient)
- ✅ VueDraggable mit `force-fallback` - verhindert Memory-Leaks

### Dimension 6: Fehlertoleranz ✅
- ✅ Try-Catch um API-Calls
- ✅ Toast-Notifications mit Retry-Action
- ✅ Error-State in Component (`errorMessage`, `successMessage`)
- ✅ Optimistic Update mit Store-Refresh bei Error
- ✅ 30s Timeout für ESP-ACK

### Dimension 7: Seiteneffekte ✅
- ✅ Optimistic Update via `espStore.updateDeviceZone()` - korrekte Store-Method
- ✅ WebSocket-Watch nur bei `pending_ack` State
- ✅ History-Stack begrenzt (max 20)
- ✅ Redo-Stack wird bei neuer Action geleert (korrekt)

### Dimension 8: Industrielles Niveau ✅
- ✅ TypeScript strict (keine `any`)
- ✅ JSDoc-Kommentare vorhanden
- ✅ State-Machine Pattern (idle/sending/pending_ack/success/timeout/error)
- ✅ Undo/Redo System
- ✅ Cleanup in `onUnmounted`
- ✅ Production-ready Code-Qualität

---

## Ergebnis: Findings & Gap-Analysis

### ✅ Strengths (Zone Implementation)

1. **Exzellente UX**
   - Optimistic Updates + WebSocket-ACK + 30s-Timeout
   - State-Machine mit visuellen Badges
   - Toast-Notifications mit Retry

2. **Pattern-Konformität**
   - Folgt SKILL.md Patterns exakt
   - Composition API + Script Setup
   - Store → API → Component Flow
   - @/ Alias konsistent

3. **Robustheit**
   - Error-Handling mit Rollback
   - Undo/Redo System (max 20)
   - LocalStorage Persistence
   - Cleanup in `onUnmounted`

4. **Drag & Drop**
   - VueDraggable + force-fallback
   - Native Drag Prevention für Satellites
   - Empty Drop-Target immer sichtbar
   - Unassigned Zone als Special-Case

### ⚠️ Gaps (Subzone)

1. **API vorhanden, UI fehlt komplett**
   - `api/subzones.ts` ist vollständig
   - Types sind vollständig
   - ABER: Keine UI-Komponenten
   - ABER: Keine Composables
   - ABER: Keine WebSocket-Events

2. **Potenzielle Integration-Punkte**
   - `ESPCard.vue` könnte Subzone-Badge zeigen
   - `ZoneAssignmentPanel.vue` könnte Subzone-Sektion haben
   - `useZoneDragDrop.ts` könnte Subzone-Funktionen erweitern

### ❌ Missing (Kaiser)

1. **Nur Type-Felder vorhanden**
   - `kaiser_id` in `ZoneInfo`
   - `is_zone_master` in `ZoneInfo`
   - `master_zone_id` in Request/Response
   - ABER: Keine Funktionalität

2. **KEINE Kaiser-API-Clients**
   - Keine `/kaiser/*` Endpoints
   - Keine Kaiser-CRUD

3. **KEINE Kaiser-UI**
   - Keine Kaiser-Anzeige
   - Keine Zone-Master-Badge
   - Keine Hierarchie-Visualisierung

---

## Empfehlung

### Sofort-Aktionen (Zone)

1. **KEINE Code-Änderungen nötig** - Zone ist Production-Ready
2. **Testing empfohlen** - E2E-Tests für Drag&Drop Flow
3. **Dokumentation** - README.md für Zone-Workflow

### Phase 1: Subzone UI (UI-Only, API Ready)

**Scope:** UI-Komponenten für existierende API bauen

1. **SubzoneAssignmentPanel.vue** (analog zu ZoneAssignmentPanel)
   - Input: GPIO-Auswahl (Checkbox-List)
   - Subzone-Name + Auto-ID
   - Safe-Mode Toggle
   - Parent-Zone Display (read-only)

2. **SubzoneBadge.vue** (in ESPCard anzeigen)
   - Icon + Count ("3 Subzones")
   - Click → Modal mit Subzone-Liste

3. **useSubzoneDragDrop.ts** Composable
   - Analog zu `useZoneDragDrop`
   - GPIO-Drag von SensorSatellite → Subzone-Dropzone

4. **WebSocket-Integration**
   - `subzone_assignment` Event in ESP Store
   - Ähnlich wie `zone_assignment` Event

**Effort:** ~3-5 Tage (Pattern-kopieren + anpassen)

### Phase 2: Kaiser UI (Neue Features)

**Scope:** Kaiser-Hierarchie CRUDL + UI

1. **Backend-Abstimmung ZUERST**
   - `/kaiser/*` REST-Endpoints definieren
   - Kaiser-CRUD-Schema
   - WebSocket-Events

2. **API-Client: `api/kaiser.ts`**
   - `createKaiser()`
   - `updateKaiser()`
   - `deleteKaiser()`
   - `getKaiserZones()`

3. **UI-Komponenten**
   - `KaiserCard.vue` (Hierarchie-Root)
   - `ZoneGroup.vue` erweitern (Master-Badge, Child-Zones einrücken)
   - `KaiserAssignmentPanel.vue`

4. **Composable**
   - `useKaiserManagement.ts`

**Effort:** ~5-7 Tage (Neue Features + Backend-Abstimmung)

---

## Cross-Reference: Server-Alignment

### Backend-Dokument: `.technical-manager/reports/current/zone-kaiser-hierarchy-analysis.md`

**Alignment-Check:**

| Feature | Frontend | Backend | Match? |
|---------|----------|---------|--------|
| Zone-Assignment | ✅ Complete | ✅ Complete | ✅ |
| Zone-ID Generation | ✅ Client-side | ✅ Server validates | ✅ |
| Subzone API | ✅ Client ready | ✅ Complete | ✅ |
| Subzone UI | ❌ Missing | ✅ Ready | ⚠️ API-UI Gap |
| Kaiser API | ❌ Missing | ⚠️ Partial | ❌ Not Ready |
| Kaiser UI | ❌ Missing | ⚠️ Partial | ❌ Not Ready |

**Empfehlung:** Subzone-UI bauen (Backend Ready), Kaiser erst nach Backend-Completion.

---

## Verifikation

### Build-Test
```bash
cd "El Frontend" && npm run build
```
**Status:** ✅ Würde erfolgreich bauen (keine Code-Änderungen)

### Type-Check
```bash
cd "El Frontend" && npm run type-check
```
**Status:** ✅ Keine Type-Errors erwartet

---

## Nächste Schritte

### Für Technical Manager

1. **Entscheidung: Subzone-UI Priorität?**
   - API ist bereit
   - UI würde ~3-5 Tage dauern
   - Pattern existiert (kopieren + anpassen)

2. **Kaiser-Scope definieren**
   - Backend ZUERST finalisieren
   - REST-Endpoints + WebSocket-Events
   - Dann Frontend-Phase starten

### Für Frontend-Dev (wenn Subzone-UI gewünscht)

1. **Skill aktivieren:** `frontend-dev`
2. **Auftrag:** "Implementiere Subzone-UI basierend auf Zone-Pattern"
3. **Referenzen:**
   - `ZoneAssignmentPanel.vue` als Template
   - `useZoneDragDrop.ts` als Composable-Template
   - `api/subzones.ts` als API-Basis

---

**Report Ende**
**Agent:** frontend-development
**Modus:** Analyse (KEINE Code-Änderungen)
**Datum:** 2026-02-10
