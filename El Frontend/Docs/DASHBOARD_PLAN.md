# Dashboard ESP-Card Konsolidierung - Implementierungsphasen

**Erstellt:** 2025-01-04
**Letzte Aktualisierung:** 2026-01-04
**Status:** ✅ **ALLE PHASEN ABGESCHLOSSEN** - Dashboard ist zentrale ESP-Übersicht
**Kritische Erkenntnis:** Dashboard verwendet `ESPOrbitalLayout.vue` → `esp-info-compact`, NICHT `ESPCard.vue`

---

## Fortschritts-Übersicht

| Phase | Status | Notizen |
|-------|--------|---------|
| Phase 0: Foundation | ✅ **ERLEDIGT** | Event-Handler in DashboardView.vue implementiert |
| Phase 0.5: Drag&Drop Bugfixes | ✅ **ERLEDIGT** | Siehe `Bugs_and_Phases/Bugs_Found_3.md` |
| Phase 1: esp-info-compact erweitern | ✅ **ERLEDIGT** | WiFi-Bars, Heartbeat, Settings-Icon |
| Phase 2: ESPSettingsPopover | ✅ **ERLEDIGT** | Settings-Icon öffnet schwebende Komponente |
| Phase 3: Name-Editing | ✅ **ERLEDIGT** | Inline-Edit in esp-info-compact + Popover-Edit |
| Phase 4: Zone-Management | ✅ **ERLEDIGT** | ZoneAssignmentPanel im Popover integriert |
| Phase 5: Mock-spezifische Actions | ✅ **ERLEDIGT** | Auto-Heartbeat Toggle, Heartbeat-Button |
| Phase 6: Löschfunktion | ✅ **ERLEDIGT** | Bereits in Phase 2 implementiert (Gefahrenzone) |
| Phase 7: Konsolidierung | ✅ **ERLEDIGT** | Router-Redirects, Sidebar vereinfacht, SensorsView Tabs |

### Phase 7 Implementierungsdetails (2026-01-04)

**Geänderte Dateien:**
- `src/router/index.ts` - Redirects für `/devices`, `/devices/:espId`, `/actuators`
- `src/views/DashboardView.vue` - Query-Parameter `?openSettings={espId}` Support
- `src/components/layout/AppSidebar.vue` - "Alle ESPs" entfernt, "Komponenten" hinzugefügt
- `src/views/SensorsView.vue` - Tab-System für Sensoren + Aktoren
- `src/views/DatabaseExplorerView.vue` - Link auf Dashboard aktualisiert
- `src/components/dashboard/UnassignedDropBar.vue` - Links aktualisiert
- `src/components/esp/ESPCard.vue` - Links aktualisiert + @legacy Kommentar

**Routing-Änderungen:**
| Vorher | Nachher |
|--------|---------|
| `/devices` → DevicesView | `/devices` → Redirect zu `/` |
| `/devices/:espId` → DeviceDetailView | `/devices/:espId` → Redirect zu `/?openSettings={espId}` |
| `/actuators` → ActuatorsView | `/actuators` → Redirect zu `/sensors?tab=actuators` |

**Sidebar-Änderungen:**
- "Geräte" Gruppe entfernt
- "Komponenten" als Top-Level-Item hinzugefügt (zeigt auf `/sensors`)

**SensorsView Tab-System:**
- Tab "Sensoren" (default)
- Tab "Aktoren" (via `?tab=actuators`)
- URL-Sync bei Tab-Wechsel

**Deprecation:**
- `DevicesView.vue` - @deprecated Kommentar
- `DeviceDetailView.vue` - @deprecated Kommentar
- `ActuatorsView.vue` - @deprecated Kommentar
- `ESPCard.vue` - @legacy Kommentar

### Phase 1 Implementierungsdetails (2026-01-04)

**Geänderte Dateien:**
- `src/components/esp/ESPOrbitalLayout.vue` - WiFi-Bars, Heartbeat, Settings-Icon
- `src/views/DashboardView.vue` - Event-Handler für neue Events

**Neue Features:**
1. **WiFi-Bars** - Ersetzt den einfachen connection-dot
   - 4 Balken (1-4) basierend auf RSSI
   - Menschenlesbares Label (Ausgezeichnet, Gut, Akzeptabel, Schwach, Sehr schwach)
   - Tooltip zeigt technischen dBm-Wert
   - Farbcodierung (grün → gelb → orange → rot)

2. **Heartbeat-Indikator** - Klickbar für Mock ESPs
   - Puls-Animation wenn < 30 Sekunden alt
   - Relative Zeit-Anzeige (z.B. "vor 12s")
   - Mock: Klick triggert Heartbeat
   - Real: Nur Anzeige (automatische Heartbeats)

3. **Settings-Icon** - Öffnet temporär Detail-Seite
   - Zahnrad-Icon rechts oben
   - Phase 2 wird ESPSettingsPopover implementieren

---

## Architektur-Übersicht

```
AKTUELLE ARCHITEKTUR (IST):
──────────────────────────────────────────────────────────────
DashboardView.vue
└─ ZoneGroup.vue
    └─ ESPOrbitalLayout.vue (:compact-mode="true")
        ├─ LEFT: SensorSatellites
        ├─ CENTER: esp-info-compact (Template-Bereich, Zeilen 523-589)
        │   └─ Minimale Info: Name, Badge, Status-Dot, AnalysisDropZone
        └─ RIGHT: ActuatorSatellites

DevicesView.vue (SEPARAT)
└─ ESPCard.vue
    └─ ALLE Features: WiFi-Bars, Heartbeat, Name-Edit, Delete, etc.
──────────────────────────────────────────────────────────────

ZIEL-ARCHITEKTUR (SOLL):
──────────────────────────────────────────────────────────────
DashboardView.vue
└─ ZoneGroup.vue
    └─ ESPOrbitalLayout.vue (:compact-mode="true")
        ├─ LEFT: SensorSatellites (unverändert)
        ├─ CENTER: esp-info-compact (ERWEITERT)
        │   ├─ Name (editierbar)
        │   ├─ ESP-ID (klein, sekundär)
        │   ├─ Mock/Real Badge
        │   ├─ WiFi-Bars + Label (NEU)
        │   ├─ Heartbeat-Indikator (NEU, pulsierend, klickbar)
        │   ├─ Zone-Pill (NEU)
        │   ├─ Settings-Icon (NEU) → öffnet Popover
        │   ├─ AnalysisDropZone (unverändert)
        │   └─ Quick-Actions (NEU)
        └─ RIGHT: ActuatorSatellites (unverändert)
    └─ ESPSettingsPopover.vue (NEU, schwebt über Card)

DevicesView.vue → DEPRECATED
DeviceDetailView.vue → DEPRECATED
ESPCard.vue → Nur Fallback für compactMode=false
──────────────────────────────────────────────────────────────
```

---

## Phasen-Übersicht (Korrigiert)

```
Phase 0: Foundation ──────────────────── ✅ BEREITS ERLEDIGT
    ↓
Phase 1: esp-info-compact Erweitern ──── Ziel: ESPOrbitalLayout.vue
    ↓
Phase 2: ESPSettingsPopover erstellen ── Neue Komponente
    ↓
Phase 3: Name-Editing Integration ────── In esp-info-compact + Popover
    ↓
Phase 4: Zone-Management Integration ─── Im Popover
    ↓
Phase 5: Mock-spezifische Actions ────── In esp-info-compact + Popover
    ↓
Phase 6: Löschfunktion ───────────────── Im Popover
    ↓
Phase 7: Konsolidierung & Deprecation ── Views entfernen
```

---

## Phase 0: Foundation - ✅ ERLEDIGT

### Status
Die Event-Handler für `@heartbeat`, `@delete`, `@toggle-safe-mode` sind in `DashboardView.vue` implementiert (Zeilen 197-268).

### Verifikation ✅ BESTÄTIGT
- [x] `handleHeartbeat()` ist implementiert (Zeile 202-216)
- [x] `handleDelete()` ist implementiert (Zeile 222-237)
- [x] `handleToggleSafeMode()` ist implementiert (Zeile 243-268)
- [x] Events werden von ZoneGroup korrekt nach oben propagiert

### Phase 0.5: Drag&Drop Bugfixes - ✅ ERLEDIGT
**Dokumentiert in:** `Bugs_and_Phases/Bugs_Found_3.md`

| Bug | Status | Lösung |
|-----|--------|--------|
| BUG-001: AnalysisDropZone triggert ESP-Drag | ✅ | `data-no-drag` Attribut |
| BUG-002: ESP-Card nicht sofort draggbar | ✅ | `delay: 0` + `touch-start-threshold` |
| BUG-003: Inkonsistentes Cursor-Styling | ✅ | Cursor nur auf Handle |
| BUG-005: Native Drag-Events brechen VueDraggable ab | ✅ | `force-fallback="true"` |

---

## Phase 1: esp-info-compact Erweitern

### Ziel
Der zentrale Bereich `esp-info-compact` in `ESPOrbitalLayout.vue` wird um alle fehlenden Features erweitert, die aktuell nur in `ESPCard.vue` existieren.

### Zu bearbeitende Datei

| Datei | Bereich |
|-------|---------|
| `src/components/esp/ESPOrbitalLayout.vue` | Template `esp-info-compact` (Zeilen 523-589) |

### Feature-Migration von ESPCard.vue

| Feature | ESPCard.vue Quelle | Ziel in esp-info-compact | Priorität |
|---------|-------------------|--------------------------|-----------|
| WiFi-Bars + Label | Zeilen 673-681 | Ersetze `connection-dot` | 🔴 Hoch |
| Heartbeat-Indikator | Zeilen 722-743 | Neu hinzufügen | 🔴 Hoch |
| Heartbeat-Klick (Mock) | Zeilen 464-471 | Neu hinzufügen | 🔴 Hoch |
| Zone-Pill | Zeilen 611-620 | Neu hinzufügen | 🟡 Mittel |
| Settings-Icon | Neu (Phase 2) | Vorbereiten | 🟡 Mittel |
| Quick-Actions Bereich | Zeilen 795-806 | Neu hinzufügen | 🟡 Mittel |

### Aufgaben

**1.1 WiFi-Signal-Anzeige implementieren**

| Aspekt | Beschreibung |
|--------|--------------|
| Aktuell | Nur `connection-dot` (grüner/roter Punkt) |
| Ziel | WiFi-Bars (1-4 Balken) + menschenlesbares Label |
| Quelle kopieren | `ESPCard.vue` Zeilen 673-681 |
| Utility nutzen | `src/utils/wifiStrength.ts` (falls vorhanden, sonst erstellen) |

**WiFi-Mapping (zu implementieren oder aus ESPCard übernehmen):**

| RSSI-Bereich | Balken | Label | Farbe |
|--------------|--------|-------|-------|
| ≥ -50 dBm | 4 | "Ausgezeichnet" | Grün |
| -51 bis -60 dBm | 3 | "Gut" | Grün |
| -61 bis -70 dBm | 2 | "Mittel" | Gelb |
| -71 bis -80 dBm | 1 | "Schwach" | Orange |
| < -80 dBm | 1 | "Sehr schwach" | Rot |
| null/undefined | 0 | "Unbekannt" | Grau |

**Tooltip:** Technischer Wert (z.B. "-43 dBm") für Experten

**1.2 Heartbeat-Indikator hinzufügen**

| Aspekt | Beschreibung |
|--------|--------------|
| Visuell | Herz-Icon (❤️) mit CSS-Puls-Animation |
| Animation-Trigger | Wenn `last_seen` < 30 Sekunden |
| Quelle kopieren | `ESPCard.vue` Zeilen 722-743 |

**Verhalten:**

| Zustand | Darstellung |
|---------|-------------|
| Kürzlich (< 30s) | Herz pulsiert grün |
| Normal (30s - 2min) | Herz statisch grün |
| Veraltet (> 2min) | Herz statisch gelb |
| Offline (> 5min) | Herz statisch rot/grau |

**Klick-Verhalten:**

| Gerätetyp | Aktion bei Klick |
|-----------|------------------|
| Mock | `emit('heartbeat', device)` → triggert Heartbeat |
| Real | Tooltip: "Real ESPs senden automatisch" (kein Action) |

**1.3 Emits erweitern**

| Zu bearbeiten | `ESPOrbitalLayout.vue` - Emits-Definition |
|---------------|-------------------------------------------|

**Neue Emits hinzufügen:**

| Event | Payload | Beschreibung |
|-------|---------|--------------|
| `heartbeat` | `device: ESPDevice` | Heartbeat angefordert (Mock) |
| `delete` | `device: ESPDevice` | Löschen angefordert |
| `settings` | `device: ESPDevice` | Settings-Popover öffnen |
| `name-edit` | `device: ESPDevice` | Name-Edit-Mode aktivieren |

**1.4 Zone-Pill hinzufügen (optional)**

| Aspekt | Beschreibung |
|--------|--------------|
| Visuell | Kleine Pill mit MapPin-Icon + Zone-Name |
| Position | Unter ESP-ID oder neben Status |
| Quelle kopieren | `ESPCard.vue` Zeilen 611-620 |
| Anzeige | Nur wenn `device.zone_name` vorhanden |

**1.5 Settings-Icon vorbereiten**

| Aspekt | Beschreibung |
|--------|--------------|
| Icon | Zahnrad (⚙️) oder drei Punkte (⋮) |
| Position | Rechts oben im esp-info-compact Bereich |
| Klick | `emit('settings', device)` |
| Tooltip | "Einstellungen" |

### Datenquellen-Referenz (verifiziert)

| Datum | Quelle im Device-Objekt | WebSocket-Update |
|-------|------------------------|------------------|
| WiFi RSSI | `device.wifi_rssi` | `esp_health` Event |
| Last Seen | `device.last_seen` oder `device.last_heartbeat` | `esp_health` Event |
| Status | `device.connected` (Mock) / `device.status` (Real) | `esp_health` Event |
| Zone | `device.zone_name`, `device.zone_id` | `zone_assignment` Event |

### Verifikation Phase 1 ✅ IMPLEMENTIERT

- [x] WiFi-Bars ersetzen den einfachen Connection-Dot
- [x] WiFi-Label zeigt menschenlesbaren Text ("Gut", "Schwach", etc.)
- [x] WiFi-Tooltip zeigt technischen dBm-Wert
- [x] Heartbeat-Icon ist sichtbar und pulsiert bei aktivem Gerät
- [x] Heartbeat-Klick bei Mock emittiert Event
- [x] Heartbeat-Klick bei Real zeigt Info (kein Fehler)
- [ ] Zone-Pill zeigt Zone-Name (wenn vorhanden) - **Entfällt, da Zone bereits in ZoneGroup-Header angezeigt wird**
- [x] Settings-Icon ist sichtbar und emittiert Event bei Klick
- [x] Alle neuen Emits sind in der Komponente definiert
- [x] Bestehende Funktionalität (Drag&Drop, Satellites, Chart) unverändert
- [ ] Responsive Layout funktioniert weiterhin - **Manuell testen**

**TypeScript Build:** ✅ Keine Fehler in ESPOrbitalLayout.vue oder DashboardView.vue

### Phase 2 Implementierungsdetails (2026-01-04)

**Geänderte Dateien:**
- `src/components/esp/ESPSettingsPopover.vue` - **NEU** - Schwebende Settings-Komponente
- `src/views/DashboardView.vue` - Integration der neuen Komponente

**Neue Komponente:** `ESPSettingsPopover.vue`
- **Identifikation:** Name, ESP-ID, Typ (Mock/Real) mit Hardware-Type
- **Status:** Online-Status, WiFi-Bars mit dBm, Heap-Speicher, Uptime, Heartbeat
- **Zone:** Aktuelle Zone anzeigen (Änderung via Drag & Drop Hinweis)
- **Mock-Steuerung:** Manueller Heartbeat-Button (nur für Mock ESPs)
- **Real ESP Info:** Automatische Heartbeat-Erklärung (nur für Real ESPs)
- **Gefahrenzone:** Löschen mit Bestätigungs-Dialog

**Features:**
1. **Glass Morphism Design** - Konsistent mit Modal.vue Styling
2. **ESC/Klick-außerhalb schließt** - Standard-Verhalten wie alle Modals
3. **Mobile: Bottom Sheet** - Responsive Layout auf kleinen Bildschirmen
4. **Teleport to body** - Z-Index-Konflikte vermieden
5. **Transition-Animationen** - Sanftes Ein-/Ausblenden

**Verifikation Phase 2:** ✅ IMPLEMENTIERT

- [x] Settings-Icon in esp-info-compact öffnet Popover
- [x] Popover erscheint als zentriertes Overlay
- [x] Popover blockiert NICHT das gesamte Dashboard (click-through)
- [x] Klick außerhalb schließt Popover
- [x] ESC schließt Popover
- [x] X-Button schließt Popover
- [x] Alle Sektionen sind sichtbar
- [x] Mock-Sektion nur bei Mock-Geräten sichtbar
- [x] Real ESP Info nur bei Real-Geräten sichtbar
- [x] Gefahrenzone mit Bestätigungs-Flow
- [x] Auf Mobile: Bottom Sheet Verhalten
- [x] Nur EIN Popover gleichzeitig offen (durch v-if)

### Phase 3 Implementierungsdetails (2026-01-04)

**Geänderte Dateien:**
- `src/components/esp/ESPOrbitalLayout.vue` - Inline Name-Editing im esp-info-compact Bereich
- `src/components/esp/ESPSettingsPopover.vue` - Name-Edit im Identifikation-Bereich
- `src/views/DashboardView.vue` - Event-Handler für `name-updated` Event

**Neue Features:**

1. **Inline Name-Editing in esp-info-compact (ESPOrbitalLayout)**
   - Doppelklick auf Name aktiviert Edit-Mode
   - Pencil-Icon erscheint bei Hover (dezent, opacity 0.3 → 1)
   - Input-Feld mit Underline-Style (iridescent border)
   - Enter speichert, ESC bricht ab, Blur speichert
   - Check/X Buttons für Touch-Geräte
   - Loading-Spinner während API-Call
   - Fehleranzeige inline
   - Fallback "Unbenannt" wenn Name leer (italic, muted)

2. **Name-Edit im ESPSettingsPopover**
   - Klick auf Name-Display aktiviert Edit-Mode
   - Pencil-Icon zeigt Editierbarkeit
   - Gleiches Verhalten wie Inline-Edit
   - Größere Input-Felder für bessere Usability
   - Fehleranzeige unterhalb des Inputs

3. **Synchronisation**
   - Single Source of Truth: `espStore.devices`
   - Beide Edit-Orte nutzen `espStore.updateDevice()`
   - Automatische UI-Updates durch Vue Reaktivität
   - `name-updated` Event für Logging/Debugging

**Verifikation Phase 3:** ✅ IMPLEMENTIERT

- [x] Doppelklick auf Name in esp-info-compact aktiviert Edit
- [x] Input-Feld erscheint mit aktuellem Namen
- [x] Enter speichert und beendet Edit
- [x] ESC bricht ab ohne zu speichern
- [x] Name im Popover ist editierbar (Klick aktiviert Edit)
- [x] Änderung an einer Stelle aktualisiert die andere (via Store)
- [x] Leerer Name zeigt "Unbenannt" als Fallback
- [x] Loading-State während Speichern sichtbar
- [x] Fehler zeigt Fehlermeldung (3 Sekunden sichtbar)
- [x] Nach Fehler: Input behält eingegebenen Wert für Korrektur

**CSS-Patterns verwendet:**
- Underline-Input-Style (konsistent mit Modal.vue)
- Hover-Reveal für Pencil-Icon
- Glass Morphism für Edit-Background
- Iridescent border-bottom für aktiven Input

---

## Phase 2: ESPSettingsPopover erstellen - ✅ ERLEDIGT

### Ziel
Neue Komponente die als schwebendes Panel über der ESP-Card erscheint und alle Detail-Einstellungen enthält.

### Neue Datei

| Pfad | `src/components/esp/ESPSettingsPopover.vue` |
|------|---------------------------------------------|

### Komponenten-Spezifikation

**Props-Interface:**

| Prop | Typ | Required | Beschreibung |
|------|-----|----------|--------------|
| `device` | `ESPDevice` | ✅ | Vollständiges Geräteobjekt |
| `isOpen` | `boolean` | ✅ | Sichtbarkeit des Popovers |
| `anchorRef` | `HTMLElement \| null` | ❌ | Referenz für Positionierung |

**Emits-Interface:**

| Event | Payload | Beschreibung |
|-------|---------|--------------|
| `close` | - | Popover schließen |
| `update:isOpen` | `boolean` | v-model Support |
| `name-updated` | `{ deviceId: string, name: string }` | Name geändert |
| `zone-updated` | `{ deviceId: string, zoneId: string, zoneName: string }` | Zone geändert |
| `deleted` | `{ deviceId: string }` | Gerät gelöscht |
| `heartbeat-triggered` | `{ deviceId: string }` | Heartbeat gesendet (Mock) |

### Popover-Struktur

```
┌─────────────────────────────────────────┐
│ [X] Geräte-Einstellungen                │  ← Header mit Close-Button
├─────────────────────────────────────────┤
│                                         │
│ IDENTIFIKATION                          │
│ ┌─────────────────────────────────────┐ │
│ │ Name: [________________] [✏️]       │ │  ← Editierbar
│ │ ESP-ID: ESP_MOCK_ABC123 (nur lesen) │ │
│ │ Typ: MOCK_ESP32_WROOM               │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ STATUS                                  │
│ ┌─────────────────────────────────────┐ │
│ │ ● Online seit 2h 34m                │ │
│ │ 📶 WiFi: Gut (-52 dBm)              │ │
│ │ 💾 Speicher: 44 KB frei             │ │
│ │ ❤️ Letzter Heartbeat: vor 12s       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ZONE                                    │
│ ┌─────────────────────────────────────┐ │
│ │ Aktuelle Zone: Gewächshaus Nord     │ │
│ │ [Zone ändern...]                    │ │  ← Öffnet ZoneAssignmentPanel
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─ NUR BEI MOCK ─────────────────────┐ │
│ │ MOCK-STEUERUNG                      │ │
│ │ [❤️ Heartbeat senden]               │ │
│ │ ☐ Auto-Heartbeat alle [60] Sek.    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─ GEFAHRENZONE (rot) ───────────────┐ │
│ │ [🗑️ Gerät löschen]                  │ │
│ └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

### Positionierung & Verhalten

| Aspekt | Anforderung |
|--------|-------------|
| Position Desktop | Rechts neben der ESP-Card, leicht überlappend |
| Position Mobile | Bottom Sheet (von unten einfahrend) |
| Z-Index | Höher als Cards, aber kein Full-Screen-Overlay |
| Schließen | Klick außerhalb, ESC-Taste, X-Button |
| Scroll | Dashboard bleibt scrollbar, Popover scrollt intern |
| Animation | Sanftes Ein-/Ausblenden (opacity + transform) |

### Conditional Rendering

| Sektion | Sichtbar wenn |
|---------|---------------|
| Mock-Steuerung | `isMock === true` |
| Gefahrenzone | Immer (aber Text unterschiedlich für Mock/Real) |
| Zone ändern | Immer |

### Integration in DashboardView

| Zu bearbeiten | `src/views/DashboardView.vue` |
|---------------|-------------------------------|

**Schritte:**
1. `ESPSettingsPopover` importieren
2. State für `settingsDevice` und `isSettingsOpen` hinzufügen
3. Handler für `@settings` Event von ESPOrbitalLayout
4. Popover im Template einbinden (außerhalb der ZoneGroups)

### Verifikation Phase 2

- [x] Settings-Icon in esp-info-compact öffnet Popover
- [x] Popover erscheint zentriert als Modal-Overlay
- [x] Popover blockiert NICHT das gesamte Dashboard (Overlay click-through)
- [x] Klick außerhalb schließt Popover
- [x] ESC schließt Popover
- [x] X-Button schließt Popover
- [x] Alle Sektionen sind sichtbar (Identifikation, Status, Zone, Mock/Real-spezifisch, Gefahrenzone)
- [x] Mock-Sektion nur bei Mock-Geräten sichtbar
- [x] Auf Mobile: Bottom Sheet Verhalten (CSS @media query)
- [x] Nur EIN Popover gleichzeitig offen (v-if auf settingsDevice)

---

## Phase 3: Name-Editing Integration - ✅ ERLEDIGT

### Ziel
Der Gerätename kann an zwei Stellen bearbeitet werden:
1. **Inline** in `esp-info-compact` (Doppelklick)
2. **Im Popover** (dediziertes Input-Feld)

### 3.1 Inline-Edit in esp-info-compact

| Zu bearbeiten | `src/components/esp/ESPOrbitalLayout.vue` |
|---------------|-------------------------------------------|
| Quelle kopieren | `ESPCard.vue` Zeilen 497-551 |

**Verhalten:**

| Aktion | Reaktion |
|--------|----------|
| Doppelklick auf Name | Edit-Mode aktivieren, Input-Feld erscheint |
| Enter | Speichern via `espStore.updateDevice()` |
| ESC | Abbrechen, alter Name bleibt |
| Blur (Fokus verloren) | Speichern |
| Während Speichern | Loading-Indikator, Input disabled |
| Bei Fehler | Toast-Nachricht, Rollback auf alten Namen |

**State-Variablen (lokal in Komponente):**

| Variable | Typ | Beschreibung |
|----------|-----|--------------|
| `isEditingName` | `boolean` | Edit-Mode aktiv |
| `editedName` | `string` | Temporärer Wert während Edit |
| `isSavingName` | `boolean` | API-Call läuft |

### 3.2 Name-Edit im Popover

| Zu bearbeiten | `src/components/esp/ESPSettingsPopover.vue` |
|---------------|---------------------------------------------|

**Verhalten:**
- Input-Feld mit Label "Gerätename"
- Pencil-Icon neben Input zeigt Editierbarkeit
- Änderung wird bei Blur oder explizitem Save gespeichert
- Gleiche API: `espStore.updateDevice(deviceId, { name })`

### 3.3 Synchronisation

| Anforderung | Implementierung |
|-------------|-----------------|
| Single Source of Truth | Name kommt aus `espStore.devices` |
| Reaktivität | Computed Property die auf Store zugreift |
| Kein lokaler Cache | `editedName` nur während aktivem Edit |

### Verifikation Phase 3 ✅ IMPLEMENTIERT

- [x] Doppelklick auf Name in esp-info-compact aktiviert Edit
- [x] Input-Feld erscheint mit aktuellem Namen
- [x] Enter speichert und beendet Edit
- [x] ESC bricht ab ohne zu speichern
- [x] Name im Popover ist editierbar (Klick statt Doppelklick)
- [x] Änderung an einer Stelle aktualisiert die andere (via espStore)
- [x] Leerer Name zeigt "Unbenannt" als Fallback (nicht ESP-ID, da zu technisch)
- [x] Loading-State während Speichern sichtbar
- [x] Fehler zeigt inline Fehlermeldung (verschwindet nach 3 Sekunden)
- [x] Nach Fehler: Input behält eingegebenen Wert für Korrektur

---

## Phase 4: Zone-Management Integration

### Ziel
Zone kann im Popover geändert werden unter Verwendung des existierenden `ZoneAssignmentPanel`.

### Zu bearbeiten

| Datei | Änderung |
|-------|----------|
| `src/components/esp/ESPSettingsPopover.vue` | ZoneAssignmentPanel einbetten |

### Integration

**Option A: Inline im Popover**
- ZoneAssignmentPanel direkt in der Zone-Sektion einbetten
- Vorteil: Alles in einem Fenster
- Nachteil: Popover wird größer

**Option B: Sub-Panel**
- Button "Zone ändern" öffnet separates Panel
- ZoneAssignmentPanel als eigenes Overlay
- Vorteil: Popover bleibt kompakt
- Nachteil: Mehr Klicks

**Empfehlung:** Option A (Inline) - Entwickler prüft ob Platz ausreicht

### Props für ZoneAssignmentPanel

| Prop | Wert |
|------|------|
| `espId` | `device.device_id` |
| `currentZoneId` | `device.zone_id` |
| `currentZoneName` | `device.zone_name` |
| `currentMasterZoneId` | `device.master_zone_id` |
| `isMock` | Computed aus `device.device_id` |

### Event-Handling

| Event | Handling |
|-------|----------|
| `zone-updated` | Toast "Zone geändert", Emit nach oben |
| `zone-error` | Fehlermeldung im Popover anzeigen |

### Konsistenz mit Drag&Drop

| Aspekt | Sicherstellung |
|--------|----------------|
| Beide Methoden | Zone via Drag&Drop ODER via Popover |
| Gleiche API | Beide nutzen `zonesApi.assignZone()` |
| Store-Update | Beide aktualisieren `espStore` |

### Phase 4 Implementierungsdetails (2026-01-04)

**Geänderte Dateien:**
- `src/components/zones/ZoneAssignmentPanel.vue` - Neuer `compact`-Prop für Einbettung ohne Card-Wrapper
- `src/components/esp/ESPSettingsPopover.vue` - ZoneAssignmentPanel im Zone-Bereich integriert
- `src/views/DashboardView.vue` - Event-Handler für `zone-updated`

**Neue Features:**

1. **Compact Mode für ZoneAssignmentPanel**
   - Neuer `compact: boolean` Prop (default: false)
   - Ohne Card-Wrapper für Einbettung in andere Komponenten
   - Kompaktere Status-Badges und Buttons
   - Zone-ID Preview unter dem Input

2. **Zone-Management im ESPSettingsPopover**
   - Aktuelle Zone wird als Badge angezeigt (wenn vorhanden)
   - ZoneAssignmentPanel inline eingebettet
   - Input für Zonenname mit automatischer zone_id Generierung
   - Speichern/Entfernen Buttons
   - Status-Anzeige (Sending, Pending ACK, Success, Timeout)
   - Error/Success Messages inline

3. **Event-Propagation**
   - `zone-updated` Event von ZoneAssignmentPanel → ESPSettingsPopover → DashboardView
   - Logging für Debugging

**Architektur:**
- Single Source of Truth: ESP Store (via zonesApi)
- ZoneAssignmentPanel nutzt `zonesApi.assignZone()` / `zonesApi.removeZone()`
- WebSocket-ACK für Real ESPs (30s Timeout)
- Sofortige Bestätigung für Mock ESPs

### Verifikation Phase 4 ✅ IMPLEMENTIERT

- [x] ZoneAssignmentPanel ist im Popover sichtbar
- [x] Aktuelle Zone wird korrekt angezeigt (als Badge)
- [x] Zone kann geändert werden (Input + Speichern-Button)
- [x] Neue Zone kann erstellt werden (Zonenname eingeben)
- [x] Zone kann entfernt werden (Entfernen-Button)
- [x] Nach Änderung: Card bewegt sich in korrekte ZoneGroup (via Store-Reaktivität)
- [x] Drag&Drop funktioniert weiterhin (nicht beeinflusst)
- [x] Keine Konflikte zwischen beiden Methoden (gleiche API)
- [x] WebSocket-ACK wird korrekt verarbeitet (State Machine in ZoneAssignmentPanel)

**TypeScript Build:** ✅ Keine neuen Fehler in geänderten Dateien

---

## Phase 5: Mock-spezifische Actions

### Ziel
Mock-spezifische Funktionen sind verfügbar, aber NUR für Mock ESPs sichtbar.

### 5.1 Heartbeat-Button (zwei Orte)

**In esp-info-compact (Quick Action):**

| Aspekt | Beschreibung |
|--------|--------------|
| Sichtbarkeit | Nur wenn `isMock === true` |
| Icon | Herz (❤️) |
| Klick | `emit('heartbeat', device)` |
| Feedback | Kurze Animation "gesendet" |

**Im Popover:**

| Aspekt | Beschreibung |
|--------|--------------|
| Sektion | "Mock-Steuerung" (nur für Mocks) |
| Button | "Heartbeat senden" mit Herz-Icon |
| Action | `espStore.triggerHeartbeat(deviceId)` |
| Feedback | Button zeigt "Gesendet ✓" für 2 Sekunden |

### 5.2 Auto-Heartbeat Toggle

| Aspekt | Beschreibung |
|--------|--------------|
| Ort | Nur im Popover, Sektion "Mock-Steuerung" |
| UI | Toggle-Switch + Intervall-Input |
| Label | "Automatische Heartbeats" |
| Intervall | Number-Input, Default 60, Min 10, Max 300 |
| Action | `espStore.setAutoHeartbeat(deviceId, enabled, interval)` |

### 5.3 Anzeige für Real ESPs

| Ort | Anzeige |
|-----|---------|
| esp-info-compact | Kein Heartbeat-Button |
| Popover | Info-Text: "Dieses Gerät sendet automatisch Heartbeats alle 60 Sekunden" |

### Conditional Rendering Pattern

```
Entwickler soll prüfen:
- Computed Property `isMock` basierend auf device.device_id
- Oder Utility-Funktion `isMockEsp()` aus src/api/esp.ts verwenden
```

### Phase 5 Implementierungsdetails (2026-01-04)

**Geänderte Dateien:**
- `src/components/esp/ESPSettingsPopover.vue` - Auto-Heartbeat Toggle mit Intervall-Konfiguration

**Neue Features:**

1. **Auto-Heartbeat Toggle im ESPSettingsPopover**
   - Toggle-Switch für "Automatische Heartbeats" (nur Mock ESPs)
   - Konfigurierbares Intervall (10-300 Sekunden, Default: 60)
   - Loading-State während API-Call
   - Dynamischer Hilfetext basierend auf Toggle-Status
   - Nutzt `espStore.setAutoHeartbeat(deviceId, enabled, interval)`

2. **Heartbeat-Button in esp-info-compact (Phase 1)**
   - Bereits in Phase 1 als Heartbeat-Indikator implementiert
   - Mock ESPs: Klickbar, triggert manuellen Heartbeat
   - Real ESPs: Nicht klickbar, nur Anzeige

3. **Heartbeat-Button im Popover (Phase 2)**
   - Bereits in Phase 2 implementiert in Mock-Steuerung Sektion
   - "Heartbeat senden" Button mit Loading-State

**Architektur:**
- Single Source of Truth: Device-Status aus `espStore.devices`
- API-Integration: `debugApi.setAutoHeartbeat()` mit Query-Params
- State-Sync: Initial-Wert aus `device.auto_heartbeat` beim Öffnen

**CSS-Pattern:**
- Custom Toggle-Switch (iOS-Style)
- Slide-fade Transition für Intervall-Input
- Purple/Violet Akzentfarbe (konsistent mit Mock-Branding)

### Verifikation Phase 5 ✅ IMPLEMENTIERT

- [x] Mock: Heartbeat-Button in esp-info-compact sichtbar (klickbarer Heartbeat-Indikator)
- [x] Mock: Heartbeat-Button im Popover sichtbar ("Heartbeat senden")
- [x] Mock: Heartbeat-Klick sendet tatsächlich (via espStore.triggerHeartbeat)
- [x] Mock: Auto-Heartbeat Toggle funktioniert
- [x] Mock: Intervall-Änderung wird gespeichert (via espStore.setAutoHeartbeat)
- [x] Real: Heartbeat-Indikator in esp-info-compact nicht klickbar
- [x] Real: Info-Text statt Mock-Steuerung im Popover
- [ ] Kein JavaScript-Fehler bei Real ESPs - **Manuell testen**

**TypeScript Build:** ✅ Keine neuen Fehler in ESPSettingsPopover.vue

---

## Phase 6: Löschfunktion - ✅ ERLEDIGT (in Phase 2)

**Bereits implementiert in Phase 2:**
- Gefahrenzone im ESPSettingsPopover
- Bestätigungs-Dialog mit zwei Schritten
- Unterschiedlicher Text für Mock/Real ESPs
- API-Integration via `espStore.deleteDevice()`

---

## ~~Phase 6: Löschfunktion~~ (Bereits in Phase 2 implementiert)

### Ziel
Geräte (Mock UND Real) können über das Popover gelöscht werden mit angemessener Warnung.

### 6.1 Gefahrenzone im Popover

| Aspekt | Beschreibung |
|--------|--------------|
| Position | Ganz unten im Popover |
| Visuell | Roter Rahmen oder roter Hintergrund-Tint |
| Überschrift | "Gefahrenzone" |

### 6.2 Bestätigungs-Flow

```
Schritt 1: Klick auf "Gerät löschen"
    ↓
Schritt 2: Bestätigungs-Dialog erscheint
    ├─ Text: "Möchtest du [Name] wirklich löschen?"
    ├─ Zusatz (Mock): "Der simulierte ESP wird entfernt."
    ├─ Zusatz (Real): "Das Gerät und alle Sensoren/Aktoren werden aus der Datenbank entfernt."
    ├─ Button: "Abbrechen" (primär, links)
    └─ Button: "Endgültig löschen" (rot, rechts)
    ↓
Schritt 3a: "Abbrechen" → Dialog schließt, nichts passiert
Schritt 3b: "Löschen" → API-Call
    ↓
Schritt 4: Erfolg
    ├─ Popover schließt
    ├─ Toast: "Gerät erfolgreich gelöscht"
    └─ Card verschwindet aus Dashboard
```

### 6.3 API-Routing (bereits implementiert)

| Gerätetyp | Endpoint |
|-----------|----------|
| Mock | `DELETE /debug/mock-esp/{id}` (zuerst), Fallback auf DB |
| Real | `DELETE /esp/devices/{id}` |

**Unified API:** `espStore.deleteDevice(deviceId)` routet automatisch

### 6.4 Error-Handling

| Fehler | Handling |
|--------|----------|
| Netzwerkfehler | Toast "Löschen fehlgeschlagen", Dialog bleibt offen |
| 404 | Toast "Gerät existiert nicht mehr", UI aktualisieren |
| 403 | Toast "Keine Berechtigung" |

### Verifikation Phase 6

- [ ] Gefahrenzone ist visuell abgesetzt (rot)
- [ ] Lösch-Button ist sichtbar
- [ ] Klick öffnet Bestätigungs-Dialog
- [ ] Dialog-Text unterscheidet Mock/Real
- [ ] "Abbrechen" schließt Dialog ohne Aktion
- [ ] "Löschen" ruft API auf
- [ ] Erfolg: Popover schließt, Toast erscheint, Card verschwindet
- [ ] Fehler: Verständliche Meldung, Dialog bleibt offen
- [ ] Löschen funktioniert für Mock ESPs
- [ ] Löschen funktioniert für Real ESPs

---

## Phase 7: Konsolidierung & View-Deprecation

### Ziel
Dashboard hat alle Funktionen, DevicesView und DeviceDetailView werden deprecated.

### 7.1 Feature-Parität Audit

Der Entwickler erstellt finale Checkliste:

| Funktion | Dashboard | Ursprung |
|----------|:---------:|----------|
| ESP-Liste nach Zonen | ✅ | Bereits vorhanden |
| Orbital Layout (Sensors/Actuators) | ✅ | Bereits vorhanden |
| Live-Sensor-Werte | ✅ | Bereits vorhanden |
| Live-Actuator-Status | ✅ | Bereits vorhanden |
| Connection Lines | ✅ | Bereits vorhanden |
| Multi-Sensor-Chart | ✅ | Bereits vorhanden |
| Mock erstellen | ✅ | Bereits vorhanden |
| Drag&Drop Zone-Wechsel | ✅ | Bereits vorhanden |
| WiFi-Signal (menschenlesbar) | ✅ | Phase 1 |
| Heartbeat-Indikator | ✅ | Phase 1 |
| Name bearbeiten | ✅ | Phase 3 |
| Zone zuweisen (Panel) | ✅ | Phase 4 |
| Heartbeat triggern (Mock) | ✅ | Phase 1 (klickbar in esp-info-compact) |
| Auto-Heartbeat (Mock) | ✅ | Phase 5 (Toggle + Intervall im Popover) |
| Gerät löschen | ✅ | Phase 2 (Gefahrenzone im Popover) |

### 7.2 Deprecation-Hinweise

| Datei | Aktion |
|-------|--------|
| `DevicesView.vue` | Kommentar Zeile 1: `// DEPRECATED: Alle Funktionen nun im Dashboard. Entfernung geplant.` |
| `DeviceDetailView.vue` | Kommentar Zeile 1: `// DEPRECATED: Funktionen in ESPSettingsPopover. Entfernung geplant.` |
| `ESPCard.vue` | Kommentar: `// Verwendet nur noch als Fallback für compactMode=false` |

### 7.3 Router-Anpassung

| Route | Änderung |
|-------|----------|
| `/devices` | Redirect zu `/` |
| `/devices/:id` | Redirect zu `/` mit Query `?openSettings={id}` |

**Dashboard muss Query-Parameter verarbeiten:**
- Bei `?openSettings={id}` automatisch Popover für dieses Gerät öffnen

### 7.4 Navigation anpassen

| Element | Änderung |
|---------|----------|
| Sidebar | "Geräte"-Link entfernen oder zu "/" ändern |
| Breadcrumbs | Falls vorhanden, anpassen |

### 7.5 Dokumentation

| Dokument | Änderung |
|----------|----------|
| `CLAUDE_FRONTEND.md` | Views-Sektion aktualisieren |
| Diese Analyse | Als historisches Dokument markieren |

### Verifikation Phase 7

- [ ] Alle Funktionen aus Checklist im Dashboard verfügbar
- [ ] Deprecation-Kommentare eingefügt
- [ ] Router-Redirects funktionieren
- [ ] Query-Parameter `?openSettings` öffnet Popover
- [ ] Sidebar zeigt keine veralteten Links
- [ ] Keine Console-Fehler bei Redirects
- [ ] Dokumentation aktualisiert

---

## Zeitschätzung (Aktualisiert)

```
Phase 0: Foundation              │ ✅ ERLEDIGT │
Phase 1: esp-info-compact        │ ✅ ERLEDIGT │ ESPOrbitalLayout.vue
Phase 2: ESPSettingsPopover      │ ✅ ERLEDIGT │ Neue Komponente (inkl. Löschfunktion)
Phase 3: Name-Editing            │ ✅ ERLEDIGT │ Beide Orte (Inline + Popover)
Phase 4: Zone-Management         │ ✅ ERLEDIGT │ ZoneAssignmentPanel im Popover
Phase 5: Mock-Actions            │ ✅ ERLEDIGT │ Auto-Heartbeat Toggle
Phase 6: Löschfunktion           │ ✅ ERLEDIGT │ (Bereits in Phase 2)
Phase 7: Konsolidierung          │ ⏳ Geplant  │ Cleanup, Router-Redirects
─────────────────────────────────┴─────────────┴──────────
Verbleibend:                       Phase 7 (2-3h)
```

**Status:** Phasen 0-6 abgeschlossen, nur Phase 7 (Konsolidierung) verbleibend

---

## Qualitäts-Checkliste (Pro Phase)

- [ ] **Robust:** Edge Cases (null, undefined, leere Strings) behandelt
- [ ] **Wartbar:** Keine Code-Duplikation, bestehende Patterns verwendet
- [ ] **Zukunftsfähig:** Komponenten wiederverwendbar
- [ ] **Menschenverständlich:** Keine technischen Rohwerte ohne Erklärung
- [ ] **Konsistent:** Design-System eingehalten (Iridescent, Glass Morphism)
- [ ] **Industrietauglich:** Error-Handling, Loading-States, keine Console-Fehler
- [ ] **Getestet:** Manuelle Tests für Happy Path und Error Cases

---

**Ende der überarbeiteten Implementierungsphasen**