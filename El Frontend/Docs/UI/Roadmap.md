# Frontend Refinement - Implementierungsplan

**Projekt:** AutomationOne Frontend UX-Verbesserungen
**Datum:** 23. Dezember 2025
**Status:** BEREIT ZUR IMPLEMENTIERUNG

---

## Zusammenfassung

Umfassende Frontend-Verbesserungen mit Fokus auf:
1. View-Umstrukturierung (Dashboard ↔ ESP-Geräte tauschen)
2. Zonen-Gruppierung mit Farbkodierung
3. Menschenverständliche Anzeigen (WiFi-Balken, Heartbeat-Puls)
4. GPIO-Pin-Selektor mit Empfehlungen
5. **Display-Name für ESPs** (Frontend + Server)

**Entscheidungen:**
- ✅ Display-Name mit Server-Änderung implementieren
- ⏸️ Subzone-Gruppierung innerhalb ESP-Cards → spätere Phase
- ✅ Vollständige Implementierung (alle Features auf einmal)

---

## Bereits Vorhanden (Keine Änderung nötig)

- ✅ `ESPOrbitalLayout.vue` - Orbital-Positionierung funktioniert
- ✅ `SensorSatellite.vue` / `ActuatorSatellite.vue` - Komplett
- ✅ `ConnectionLines.vue` - Framework bereit
- ✅ Zone-Filterung in DevicesView
- ✅ Mock/Real Badge-Unterscheidung
- ✅ Iridescent CSS-Variablen

---

## Phase 1: Utility-Dateien (Tag 1)

### 1.1 Neue Datei: `src/utils/zoneColors.ts`
Automatische Farbzuweisung für Zonen basierend auf ID-Hash.

```typescript
// Funktionen:
getZoneColor(zoneId: string | null): ZoneColorInfo
getZoneColorRGB(zoneId: string): string
```

### 1.2 Neue Datei: `src/utils/wifiStrength.ts`
WiFi-Signal zu Balken-Konvertierung.

```typescript
// Funktionen:
getWifiStrength(rssi: number | null): WifiStrengthInfo
// Returns: { bars: 0-4, label: 'Ausgezeichnet'|'Gut'|etc., quality: string }
```

### 1.3 Neue Datei: `src/utils/gpioConfig.ts`
ESP32 GPIO Pin-Konfigurationen mit Kategorien.

```typescript
// Kategorien: recommended, available, caution, avoid, input_only
// Funktionen:
getGpioConfig(hardwareType: string): GpioPin[]
getAvailablePins(hardwareType: string, usedPins: number[]): GpioPin[]
```

### 1.4 Update: `src/types/index.ts`
Neue Interfaces: `ZoneGroup`, `SubzoneGroup`, `HeartbeatState`

---

## Phase 2: Neue Komponenten (Tag 1-2)

### 2.1 Neue Komponente: `src/components/common/WifiSignalBars.vue`
- 4 vertikale Balken (wie Handy-Signal)
- Farbe: grün → gelb → rot basierend auf Stärke
- Props: `rssi`, `showLabel?`, `showDbm?`, `size?`

### 2.2 Neue Komponente: `src/components/common/HeartbeatIndicator.vue`
- Pulsierendes Herz-Icon bei Empfang
- Grün (< 60s), Gelb (60-120s), Rot (> 120s stale)
- Props: `lastHeartbeat`, `staleThreshold?`, `showTimestamp?`
- Emit: `trigger` für manuellen Heartbeat

### 2.3 Neue Komponente: `src/components/zones/ZoneGroup.vue`
- Container mit farbkodiertem Header
- Geräte-Anzahl Badge
- Zusammenklappbar
- Props: `zoneId`, `zoneName?`, `deviceCount`, `collapsible?`

### 2.4 Neue Komponente: `src/components/common/GPIOSelector.vue`
- Gruppierte Sections: Empfohlen, Verfügbar, Vermeiden
- Pin-Chips mit GPIO-Nummer und Features (ADC, PWM, etc.)
- Warnung-Tooltips für problematische Pins
- Props: `modelValue`, `hardwareType?`, `usedPins?`, `mode?`

---

## Phase 3: View-Änderungen (Tag 2-3)

### 3.1 View-Tausch

| Vorher | Nachher | Route |
|--------|---------|-------|
| DashboardView.vue (Stat-Cards) | → DeviceListView.vue | `/device-list` |
| DevicesView.vue (Orbital-Cards) | → DashboardView.vue | `/` (Root) |

**Router-Änderungen** (`src/router/index.ts`):
```typescript
{ path: '', name: 'dashboard', component: DashboardView }  // War DevicesView
{ path: '/device-list', name: 'device-list', component: DeviceListView }  // War Dashboard
{ path: '/devices', redirect: '/' }  // Backward-Compat
```

### 3.2 Neues DashboardView.vue (Haupt-Landing-Page)
- Inhalt von aktuellem DevicesView übernehmen
- **NEU:** Zonen-Gruppierung hinzufügen
- ESPs nach `zone_id` gruppieren mit `ZoneGroup` Container
- "Ohne Zone" Sektion für nicht zugewiesene Geräte

### 3.3 Neues DeviceListView.vue (Kompakte Liste)
- Inhalt von aktuellem DashboardView übernehmen
- Stat-Cards, Quick Actions, System Status behalten
- Route-Links aktualisieren

### 3.4 ESPOrbitalLayout.vue Anpassungen
**Zu ändern:**
- WiFi: `WifiSignalBars` statt "-65 dBm"
- Counts: "3 Sensoren · 1 Aktor" statt "3 / 1"
- Heartbeat: `HeartbeatIndicator` hinzufügen
- Display-Name: Anzeige des nutzerdefinierten Namens (falls vorhanden)

### 3.5 DeviceDetailView.vue Anpassungen
- `GPIOSelector` in Add-Sensor/Actuator-Modals integrieren
- `WifiSignalBars` für WiFi-Anzeige
- `HeartbeatIndicator` hinzufügen
- **Display-Name Inline-Bearbeitung** (Doppelklick zum Bearbeiten)

---

## Phase 5: Server-Änderungen (Display-Name)

### 5.1 Database Model (`El Servador/god_kaiser_server/src/db/models/`)
- `ESPDevice` Model: Neues Feld `display_name: Optional[str]`

### 5.2 Alembic Migration
- Neue Migration: `add_display_name_to_esp_devices.py`
- `ALTER TABLE esp_devices ADD COLUMN display_name VARCHAR(100) NULL`

### 5.3 Pydantic Schemas (`src/schemas/esp.py`)
- `ESPDeviceResponse`: Feld `display_name: Optional[str]` hinzufügen
- `ESPDeviceUpdate`: Feld `display_name: Optional[str]` hinzufügen

### 5.4 API Endpoint (`src/api/v1/esp.py`)
- `PATCH /api/v1/esp/devices/{device_id}` bereits vorhanden
- Sicherstellen, dass `display_name` im Update-Schema enthalten

### 5.5 Frontend API (`El Frontend/src/api/esp.ts`)
- `updateDevice()`: `display_name` im Payload unterstützen
- Interface `ESPDevice`: Feld `display_name?: string` hinzufügen

---

## Phase 6: Integration (Tag 4)

### 6.1 Sidebar-Navigation aktualisieren
- "Dashboard" → zeigt auf neue Orbital-Ansicht (`/`)
- "Geräteliste" hinzufügen → zeigt auf `/device-list`

### 6.2 Toast-Feedback
- Heartbeat-Trigger: "Heartbeat gesendet" Toast
- Server-Bestätigungen visualisieren

### 6.3 Export-Updates
- `src/utils/index.ts` - neue Utilities exportieren
- `src/components/common/index.ts` - neue Komponenten exportieren

---

## Kritische Dateien

### Frontend
| Datei | Änderung |
|-------|----------|
| [router/index.ts](El Frontend/src/router/index.ts) | Route-Swap |
| [views/DashboardView.vue](El Frontend/src/views/DashboardView.vue) | Wird zu DeviceListView |
| [views/DevicesView.vue](El Frontend/src/views/DevicesView.vue) | Wird zu neuem Dashboard mit Zone-Gruppierung |
| [components/esp/ESPOrbitalLayout.vue](El Frontend/src/components/esp/ESPOrbitalLayout.vue) | WiFi, Heartbeat, Counts, Display-Name |
| [views/DeviceDetailView.vue](El Frontend/src/views/DeviceDetailView.vue) | GPIOSelector, Display-Name-Bearbeitung |
| [api/esp.ts](El Frontend/src/api/esp.ts) | display_name Support |
| [types/index.ts](El Frontend/src/types/index.ts) | Neue Interfaces |

### Server
| Datei | Änderung |
|-------|----------|
| [db/models/esp_device.py](El Servador/god_kaiser_server/src/db/models/) | display_name Feld |
| [schemas/esp.py](El Servador/god_kaiser_server/src/schemas/) | display_name in Schemas |
| alembic/versions/ | Neue Migration |

### Neue Dateien
| Datei | Zweck |
|-------|-------|
| `src/utils/zoneColors.ts` | Zone-Farbzuweisung |
| `src/utils/wifiStrength.ts` | WiFi-Balken-Konvertierung |
| `src/utils/gpioConfig.ts` | GPIO Pin-Konfigurationen |
| `src/components/common/WifiSignalBars.vue` | WiFi-Anzeige |
| `src/components/common/HeartbeatIndicator.vue` | Heartbeat-Puls |
| `src/components/zones/ZoneGroup.vue` | Zone-Container |
| `src/components/common/GPIOSelector.vue` | GPIO-Auswahl |
| `src/views/DeviceListView.vue` | Neue Listenansicht |

---

## Risiken & Mitigationen

| Risiko | Mitigation |
|--------|------------|
| View-Swap bricht Bookmarks | Redirect von `/devices` auf `/` |
| Zone-Gruppierung Performance | Computed Properties mit Memoization |
| GPIO-Selector Komplexität | Einfache Version zuerst, erweiterte Features später |

---

## Geschätzter Aufwand

| Phase | Aufwand | Beschreibung |
|-------|---------|--------------|
| Phase 1 | ~4 Std | Utilities (zoneColors, wifiStrength, gpioConfig) |
| Phase 2 | ~8 Std | Neue Komponenten (WiFi, Heartbeat, Zone, GPIO) |
| Phase 3 | ~10 Std | View-Änderungen (Swap, Zone-Gruppierung) |
| Phase 4 | ~2 Std | ESPOrbitalLayout + DeviceDetailView Anpassungen |
| Phase 5 | ~4 Std | Server (Display-Name: Model, Migration, Schema) |
| Phase 6 | ~4 Std | Integration (Sidebar, Toast, Exports) |
| **Total** | **~32 Std** | **4-5 Entwicklertage** |

---

## Implementierungsreihenfolge

```
Tag 1: Phase 1 (Utilities) + Phase 2 Start (WifiSignalBars, HeartbeatIndicator)
Tag 2: Phase 2 (ZoneGroup, GPIOSelector) + Phase 5 (Server)
Tag 3: Phase 3 (View-Swap, Zone-Gruppierung)
Tag 4: Phase 4 (Komponenten-Integration) + Phase 6 (Finalisierung)
```
