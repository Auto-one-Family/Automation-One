# Dashboard UI Feinschliff - Codebase Analyse

## Datum: 2026-01-04
## Analysiert von: Claude Opus 4.5 (KI-Agent)

---

## Zusammenfassung der Haupterkenntnisse

| Bereich | Status | Kritische Findings |
|---------|--------|-------------------|
| **ESP Card & Satellites** | ✅ Dokumentiert | 8 Komponenten, vollständiges Design-System |
| **Auto-Heartbeat Bug** | 🔴 **BUG GEFUNDEN** | `auto_heartbeat` geht bei `fetchAll()` verloren |
| **Geräte-Einstellungen** | ✅ Dokumentiert | ESPSettingsPopover.vue vollständig analysiert |

---

## 1. ESP Card & Satellite Design

### 1.1 Komponenten-Mapping

| Komponente | Pfad | LOC | Hauptzweck |
|-----------|------|-----|-----------|
| **ESPOrbitalLayout.vue** | [ESPOrbitalLayout.vue](src/components/esp/ESPOrbitalLayout.vue) | 1767 | **HAUPTKOMPONENTE** für Dashboard - Horizontales 3-Spalten-Layout |
| **ESPCard.vue** | [ESPCard.vue](src/components/esp/ESPCard.vue) | 1543 | Legacy Komponente für ZoneGroup |
| **SensorSatellite.vue** | [SensorSatellite.vue](src/components/esp/SensorSatellite.vue) | 355 | Kompakte Sensor-Darstellung |
| **ActuatorSatellite.vue** | [ActuatorSatellite.vue](src/components/esp/ActuatorSatellite.vue) | 336 | Kompakte Aktor-Darstellung |
| **ConnectionLines.vue** | [ConnectionLines.vue](src/components/esp/ConnectionLines.vue) | 395 | SVG-basierte Verbindungslinien |
| **ESPSettingsPopover.vue** | [ESPSettingsPopover.vue](src/components/esp/ESPSettingsPopover.vue) | ~800 | Settings-Popup |
| **DashboardView.vue** | [DashboardView.vue](src/views/DashboardView.vue) | ~600 | Nutzt ESPOrbitalLayout, ZoneGroup |
| **CreateMockEspModal.vue** | [CreateMockEspModal.vue](src/components/modals/CreateMockEspModal.vue) | 319 | Mock ESP Erstellung |

### 1.2 Mock vs. Real ESP Unterscheidung

**Erkennungsmechanismus:**
- **Datei:** [esp.ts:144-149](src/api/esp.ts#L144-L149)
```typescript
function isMockEsp(espId: string): boolean {
  return (
    espId.startsWith('ESP_MOCK_') ||
    espId.startsWith('MOCK_') ||
    espId.includes('MOCK')
  )
}
```

**Visuelle Unterschiede:**

| Element | Mock | Real |
|---------|------|------|
| Type Badge | `variant="mock"` (Lila #a78bfa) | `variant="real"` (Cyan #22d3ee) |
| Section Border (Einstellungen) | `rgba(168, 85, 247, 0.15)` | Standard |
| Heartbeat-Steuerung | Manuell + Auto-Toggle | Nur Info-Text |
| Hardware Type | `MOCK_ESP32_WROOM` | `ESP32_WROOM` |

**Mock-spezifische Aktionen:**
1. `handleHeartbeat()` - Manueller Heartbeat-Trigger
2. `handleAutoHeartbeatToggle()` - Auto-Heartbeat an/aus
3. `handleIntervalChange()` - Interval ändern (10-300s)

**Conditional Rendering:**
```vue
<!-- ESPSettingsPopover.vue -->
<section v-if="isMock" class="popover-section popover-section--mock">
  <!-- Mock-Steuerung -->
</section>

<section v-if="!isMock" class="popover-section popover-section--info">
  <!-- Real ESP Info -->
</section>
```

### 1.3 Design-System Bestandsaufnahme

**Quelle:** [style.css](src/style.css) (757 Zeilen)

#### CSS Custom Properties

```css
/* Dark Theme Basis */
--color-bg-primary:     #0a0a0f   /* Tiefster Hintergrund */
--color-bg-secondary:   #12121a   /* Haupt-Card-Hintergrund */
--color-bg-tertiary:    #1a1a24   /* Hover-Zustände, Panels */
--color-bg-hover:       #22222e   /* Hover-Effekt */

/* Text */
--color-text-primary:   #f0f0f5   /* Primärer Text */
--color-text-secondary: #a0a0b0   /* Labels */
--color-text-muted:     #606070   /* Placeholder */

/* Iridescent Akzente (Wasser-Reflexion) */
--color-iridescent-1: #60a5fa   /* Himmelblau */
--color-iridescent-2: #818cf8   /* Indigo */
--color-iridescent-3: #a78bfa   /* Violett */
--color-iridescent-4: #c084fc   /* Purpur */

/* Status-Farben */
--color-success: #34d399   /* Grün (Online) */
--color-warning: #fbbf24   /* Gelb (Warnung) */
--color-error:   #f87171   /* Rot (Fehler) */
--color-info:    #60a5fa   /* Blau (Info) */

/* Mock/Real */
--color-mock: #a78bfa   /* Violett */
--color-real: #22d3ee   /* Cyan */

/* Glasmorphism */
--glass-bg:     rgba(255, 255, 255, 0.03)
--glass-border: rgba(255, 255, 255, 0.08)
--glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.3)
```

#### Tailwind-Klassen für Cards

```css
/* ESP Card Basis */
.esp-card {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* Hover */
.esp-card:hover {
  border-color: rgba(96, 165, 250, 0.25);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
```

#### Typografie

| Element | Font-Size | Font-Weight | Line-Height |
|---------|-----------|-------------|-------------|
| Card Title | 0.9375rem | 600 | 1.4 |
| ESP ID | 0.75rem (Mono) | 400 | 1.2 |
| Sensor Value | 0.8125rem (Mono) | 600 | 1.2 |
| Labels | 0.6875rem | 500 | 1.3 |
| Section Headers | 0.6875rem | 600 (uppercase) | 1.2 |

#### Spacing

| Element | Gap | Padding |
|---------|-----|---------|
| Card | 0.75rem | 1rem |
| Satellite | 0.1875rem | 0.4375rem 0.375rem |
| Section | 0.75rem | 0.875rem |
| Popover | 0 | 1rem 1.25rem |

### 1.4 Satellite-Layout Analyse

**Layout-System:** Flexbox mit 3 Spalten

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│  Sensoren      │    ESP-Card      │    Aktoren      │
│  (Flex-Col)    │   (Center)       │    (Flex-Col)   │
│                │                  │                 │
│  • Temp        │ ┌──────────────┐ │ • Pump          │
│  • pH          │ │ Kompakt Info │ │ • Valve         │
│  • EC          │ │ + Heartbeat  │ │ • Fan           │
│                │ │              │ │                 │
│  (Multi-Row    │ │ [Chart Zone] │ │                 │
│   wenn >5)     │ │              │ │                 │
│                │ └──────────────┘ │                 │
│                │                  │                 │
└─────────────────────────────────────────────────────┘
```

**Positionierung:**
```css
.esp-horizontal-layout {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0.75rem;
}

.esp-horizontal-layout__column {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 50px;
  max-width: 140px;
}
```

**Multi-Row für >5 Sensoren:**
```css
.esp-horizontal-layout__column--multi-row {
  display: grid;
  grid-template-columns: repeat(2, 65px);
  gap: 0.375rem;
}
```

**Responsive Breakpoints:**

| Breakpoint | Verhalten |
|------------|-----------|
| < 768px (Mobile) | Vertikal, Satellites horizontal wrappen |
| 768-1023px (Tablet) | Kompakt horizontal, max-width 120px |
| ≥ 1024px (Desktop) | Volle Breite, max-width 140px |

**Connection Lines:**
- **Implementierung:** SVG-basiert ([ConnectionLines.vue](src/components/esp/ConnectionLines.vue))
- **Stile:**
  - Logic Connections: Grün, 3px solid
  - Cross-ESP: Blau/Iridescent, 2px solid
  - Internal: Grau, 1.5px dashed
- **Features:** Hover-Glow, pulsende Animation bei aktiven Rules

### 1.5 Verbesserungsvorschläge (Design)

1. **Satellites "schwebender":**
   - Aktuell: Satellites sind direkt an der ESP Card anliegend
   - Vorschlag: `margin` + `box-shadow` für mehr visuelle Trennung

2. **Mock/Real Badge prominenter:**
   - Aktuell: Kleiner Badge in Einstellungen
   - Vorschlag: Subtile Border-Farbe oder Corner-Badge auf ESP Card

3. **ESPs ohne Sensoren/Aktoren:**
   - Aktuell: Leere Spalten werden ausgeblendet
   - Vorschlag: Placeholder mit "Keine Sensoren" + Quick-Add Button

---

## 2. Auto-Heartbeat UI-Sync Bug

### 2.1 Datenfluss beim Erstellen

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. CreateMockEspModal.vue:34 - Default-Wert                            │
│    auto_heartbeat: true                                                  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. CreateMockEspModal.vue:92 - API Call                                 │
│    await espStore.createDevice(config)                                   │
│    config enthält: auto_heartbeat: true                                  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. esp.ts (Store):190 - API aufrufen                                    │
│    const device = await espApi.createDevice(config)                     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. esp.ts (API):332 - Mock ESP erstellen                                │
│    const mockEsp = await debugApi.createMockEsp(mockConfig)             │
│    POST /debug/mock-esp                                                  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. Backend debug.py:244 - In simulation_config speichern               │
│    simulation_config = {                                                 │
│      "auto_heartbeat": config.auto_heartbeat,  ← TRUE                   │
│    }                                                                     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. Backend debug.py:295 - Simulation starten wenn auto_heartbeat=True  │
│    if config.auto_heartbeat:                                             │
│        simulation_started = await sim_scheduler.start_mock(...)         │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 7. Backend debug.py:169 - Response (MockESPResponse)                   │
│    auto_heartbeat: simulation_active  ← TRUE (korrekt!)                │
│                                                                          │
│    Schema: schemas/debug.py:285                                         │
│    auto_heartbeat: bool                                                  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 8. esp.ts (API):347 - Response Mapping                                  │
│    return {                                                              │
│      ...                                                                 │
│      auto_heartbeat: mockEsp.auto_heartbeat,  ← TRUE                    │
│    }                                                                     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 9. esp.ts (Store):200 - In Store speichern                              │
│    devices.value.push(device)  ← Device mit auto_heartbeat: true        │
│                                                                          │
│    ✅ BIS HIER IST ALLES KORREKT!                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Datenfluss beim Laden der Geräte-Einstellungen

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ESPSettingsPopover.vue:397 - State initialisieren                       │
│                                                                          │
│ watch(() => props.isOpen, (isOpen) => {                                 │
│   if (isOpen) {                                                          │
│     autoHeartbeatEnabled.value = (props.device as any)?.auto_heartbeat  │
│                                   ?? false                               │
│   }                                                                      │
│ })                                                                       │
│                                                                          │
│ props.device kommt aus dem Pinia Store (devices.value)                  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Problem:** `props.device` muss `auto_heartbeat` enthalten - prüfen wir woher es kommt.

### 2.3 🔴 **IDENTIFIZIERTE URSACHE**

**Das Problem liegt im `fetchAll()` oder `fetchDevice()` Aufruf!**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ NACH dem Erstellen (oder bei Page Reload):                              │
│                                                                          │
│ 1. fetchAll() wird aufgerufen (esp.ts:130-157)                         │
│                                                                          │
│ 2. GET /esp/devices → ESPDeviceListResponse                             │
│    Server-Schema: schemas/esp.py → ESPDeviceResponse                    │
│                                                                          │
│    ⚠️  ESPDeviceResponse enthält KEIN auto_heartbeat Feld!             │
│                                                                          │
│ 3. esp.ts:150 - VOLLSTÄNDIGE ÜBERSCHREIBUNG:                           │
│    devices.value = dedupedDevices                                        │
│                                                                          │
│    → Das Device mit auto_heartbeat: true wird ersetzt durch            │
│      ein neues Device OHNE auto_heartbeat                               │
│                                                                          │
│ 4. ESPSettingsPopover liest:                                            │
│    (props.device as any)?.auto_heartbeat ?? false                       │
│    → undefined ?? false → FALSE ❌                                      │
│                                                                          │
│ 🔴 BUG: auto_heartbeat geht bei fetchAll/fetchDevice verloren!          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Bestätigende Code-Referenzen

**Backend ESP Schema (schemas/esp.py):**
```bash
grep -n "auto_heartbeat" El Servador/god_kaiser_server/src/schemas/esp.py
# → KEINE TREFFER!
```

**Backend Debug Schema (schemas/debug.py:285):**
```python
auto_heartbeat: bool  # ← NUR in MockESPResponse, nicht in ESPDeviceResponse
```

**Frontend ESPDevice Interface (esp.ts:62):**
```typescript
auto_heartbeat?: boolean  // Optional - nur bei Mock ESPs vorhanden
```

**Store fetchAll (esp.ts:150):**
```typescript
devices.value = dedupedDevices  // ← VOLLSTÄNDIGE ÜBERSCHREIBUNG
```

### 2.5 Mögliche Lösungsansätze

| Lösung | Aufwand | Empfehlung |
|--------|---------|------------|
| **A) Server-seitig:** `ESPDeviceResponse` erweitern um `auto_heartbeat` | Mittel | ✅ EMPFOHLEN |
| **B) Frontend:** Vor fetchAll den `auto_heartbeat` Status merken und mergen | Hoch | ⚠️ Workaround |
| **C) Separater Store** für Mock-spezifische Felder | Hoch | ❌ Overkill |
| **D) WebSocket-basierter State** | Sehr hoch | ❌ Overkill |

**Empfohlene Lösung (A):**

1. **Backend:** `ESPDeviceResponse` (schemas/esp.py) erweitern:
   ```python
   auto_heartbeat: Optional[bool] = None  # Nur für Mock ESPs relevant
   ```

2. **Backend:** `ESPRepository.get_all_devices()` um `simulation_config.auto_heartbeat` erweitern

3. **Alternative:** Separater Endpoint `/esp/devices/{id}/simulation-status` für Mock-spezifische Felder

---

## 3. Geräte-Einstellungen Design

### 3.1 Komponenten-Struktur

**Hauptkomponente:** [ESPSettingsPopover.vue](src/components/esp/ESPSettingsPopover.vue)

**Typ:** Popover (Teleport to body, Overlay-basiert)

**Sections:**

```
ESPSettingsPopover
├── Header (Settings2 Icon + Close Button)
├── IDENTIFIKATION
│   ├── Name (editierbar, inline)
│   ├── ESP-ID (monospace, kopierbar)
│   └── Type Badge (mock/real)
├── STATUS
│   ├── Connection Badge (online/offline + Pulse)
│   ├── WiFi Display (4 Bars + RSSI)
│   ├── Heap (wenn verfügbar)
│   ├── Uptime (wenn verfügbar)
│   └── Last Heartbeat
├── ZONE
│   └── ZoneAssignmentPanel (compact mode)
├── MOCK-STEUERUNG (v-if="isMock")
│   ├── Manual Heartbeat Button
│   └── Auto-Heartbeat Toggle + Interval
├── GERÄTEINFORMATION (v-if="!isMock")
│   └── Info-Text
└── GEFAHRENZONE
    ├── Delete Button (outline)
    └── Delete Confirmation
```

### 3.2 Aktuelle Design-Elemente

#### IDENTIFIKATION

```css
/* Section */
.popover-section--identification {
  border-bottom: 1px solid var(--glass-border);
  padding-bottom: 0.875rem;
}

/* Name Display */
.name-display {
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  transition: background-color 0.15s;
}

.name-display:hover {
  background-color: var(--glass-bg);
}

/* Name Edit */
.name-input {
  background: transparent;
  border: none;
  border-bottom: 2px solid var(--color-iridescent-1);
  font-weight: 600;
}

/* ESP-ID */
.esp-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  background: var(--color-bg-tertiary);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}
```

#### STATUS

```css
/* Connection Badge */
.badge-success.pulse {
  animation: pulse 2s infinite;
}

/* WiFi Bars */
.wifi-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 16px;
}

.wifi-bar {
  width: 3px;
  border-radius: 1px;
  background: var(--color-text-muted);
  opacity: 0.25;
}

.wifi-bar.active {
  opacity: 1;
  /* Farbe je nach Qualität */
}

/* Heartbeat */
.heartbeat-fresh {
  color: var(--color-success);
}

.heart-pulse {
  animation: heart-beat 1.5s ease-in-out infinite;
}
```

#### ZONE

```css
/* ZoneAssignmentPanel (compact) */
.zone-panel--compact {
  background: transparent;
  border: none;
  padding: 0;
}

/* Zone Badge */
.badge-success {
  background: rgba(52, 211, 153, 0.15);
  color: var(--color-success);
}
```

#### MOCK-STEUERUNG

```css
/* Section */
.popover-section--mock {
  background: rgba(168, 85, 247, 0.04);
  border: 1px solid rgba(168, 85, 247, 0.15);
  border-radius: 0.5rem;
  padding: 0.875rem;
}

/* Heartbeat Button */
.heartbeat-btn {
  width: 100%;
  background: linear-gradient(135deg, rgba(244, 114, 182, 0.15), rgba(168, 85, 247, 0.1));
  border: 1px solid rgba(244, 114, 182, 0.3);
  color: #f472b6;
  border-radius: 0.5rem;
  padding: 0.625rem 1rem;
}

.heartbeat-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

/* Auto-Heartbeat Toggle */
.auto-heartbeat__toggle {
  width: 44px;
  height: 24px;
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  position: relative;
  cursor: pointer;
}

.auto-heartbeat__toggle--active {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(139, 92, 246, 0.3));
}

.auto-heartbeat__toggle-knob {
  width: 18px;
  height: 18px;
  background: var(--color-text-primary);
  border-radius: 50%;
  transition: left 0.2s;
}

.auto-heartbeat__toggle--active .auto-heartbeat__toggle-knob {
  left: 23px;
  background: #a78bfa;
  box-shadow: 0 0 8px rgba(167, 139, 250, 0.5);
}

/* Interval Input */
.interval-input {
  width: 60px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  text-align: center;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 0.375rem;
}

.interval-input:focus {
  border-color: var(--color-iridescent-1);
  outline: none;
}
```

#### GEFAHRENZONE

```css
/* Section */
.popover-section--danger {
  background: rgba(239, 68, 68, 0.04);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 0.5rem;
  padding: 0.875rem;
}

/* Title */
.danger-title {
  color: var(--color-error);
  font-weight: 600;
}

/* Delete Button (Outline) */
.delete-btn--outline {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--color-error);
}

/* Delete Button (Confirm) */
.delete-btn--confirm {
  background: var(--color-error);
  color: white;
  border: none;
}

.delete-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
```

### 3.3 Verbesserungspotential

| Bereich | Beobachtung | Vorschlag |
|---------|-------------|-----------|
| **Spacing** | Sections haben unterschiedliche Abstände | Einheitlich 0.875rem padding, 0.75rem gap |
| **Visuelle Hierarchie** | Section-Titel zu klein/unauffällig | Größere Font-Size, Icon hinzufügen |
| **Lesbarkeit** | Muted Text schwer lesbar auf Dark BG | Kontrast erhöhen (von #606070 → #808090) |
| **Hover-States** | Nicht alle interaktiven Elemente haben Hover | Cursor + Background für alle klickbaren |
| **Gruppierung** | Status-Werte lose angeordnet | Grid-Layout für Label/Value Paare |
| **Auto-Heartbeat** | Toggle ist klein und schwer zu treffen | Größerer Hit-Bereich, Labels |
| **Delete-Flow** | Bestätigung ist abrupt | Zwei-Schritt mit Timeout/Animation |

---

## Anhang: Offene Fragen

### Frage 1: Wann wird `fetchAll()` nach Create aufgerufen?

Mögliche Trigger:
- [ ] WebSocket-Event nach Mock ESP Erstellung?
- [ ] Navigation zwischen Views?
- [ ] Automatischer Refresh-Timer?
- [ ] Dashboard-Mount?

→ **Empfehlung:** Logging hinzufügen um genauen Trigger zu identifizieren.

### Frage 2: Dual-Storage Konsistenz

Mock ESPs existieren in:
1. **PostgreSQL** (ESPDevice Tabelle)
2. **In-Memory** (SimulationScheduler._runtimes)

→ **Frage:** Sind beide immer synchron? Welche ist die "Source of Truth" für `auto_heartbeat`?

### Frage 3: Device-Typ im Interface

```typescript
// ESPSettingsPopover.vue:397
autoHeartbeatEnabled.value = (props.device as any)?.auto_heartbeat ?? false
```

Der `as any` Cast deutet auf Typ-Unsicherheit hin.

→ **Frage:** Soll `ESPDevice` Interface um Mock-spezifische Felder erweitert werden, oder separate Typen?

---

## Dateien-Referenz

| Datei | Absolute Pfad | Relevanz |
|-------|---------------|----------|
| **style.css** | `El Frontend/src/style.css` | Design-Tokens |
| **ESPOrbitalLayout.vue** | `El Frontend/src/components/esp/ESPOrbitalLayout.vue` | Haupt-Layout |
| **ESPSettingsPopover.vue** | `El Frontend/src/components/esp/ESPSettingsPopover.vue` | Einstellungen |
| **CreateMockEspModal.vue** | `El Frontend/src/components/modals/CreateMockEspModal.vue` | Mock Create |
| **esp.ts (API)** | `El Frontend/src/api/esp.ts` | ESPDevice Interface, API |
| **esp.ts (Store)** | `El Frontend/src/stores/esp.ts` | Pinia Store |
| **debug.ts** | `El Frontend/src/api/debug.ts` | Debug API |
| **debug.py** | `El Servador/god_kaiser_server/src/api/v1/debug.py` | Backend Mock API |
| **schemas/debug.py** | `El Servador/god_kaiser_server/src/schemas/debug.py` | MockESPResponse |
| **schemas/esp.py** | `El Servador/god_kaiser_server/src/schemas/esp.py` | ESPDeviceResponse |

---

## Nächste Schritte

1. **Bug Fix (Priorität 1):**
   - Backend: `auto_heartbeat` zu `ESPDeviceResponse` hinzufügen
   - Oder: Separater Endpoint für Mock-Status

2. **Design-Verbesserungen (Priorität 2):**
   - Satellites visuell "schwebender" machen
   - Mock/Real Badge prominenter

3. **Testing:**
   - E2E Test für Auto-Heartbeat Flow
   - Verifizieren dass State nach Reload erhalten bleibt

---

*Dokument erstellt am 2026-01-04 durch systematische Codebase-Analyse*
