# Dashboard Browser-Analyse & Frontend-Code-Review

> **Datum:** 2026-03-07 | **Methode:** Playwright Browser + Source-Code-Analyse
> **Route:** http://localhost:5173/hardware, /monitor, /editor

---

## 1. Screenshots

| Screenshot | Beschreibung |
|------------|--------------|
| [Dashboard Uebersicht](../../../screenshot-dashboard-overview.png) | HardwareView Level 1 - Leerer Zustand mit Navigation |
| [Mock ESP Dialog](../../../screenshot-mock-erstellen-dialog.png) | CreateMockEspModal mit allen Eingabefeldern |

---

## 2. Dashboard-Uebersicht (HardwareView)

### 2.1 Navigation & Layout

**Sidebar (links, 240px):**
- Navigation: Dashboard, Regeln, Komponenten
- Administration: System, Benutzer, Kalibrierung, Plugins, Postfach
- Footer: Einstellungen, User-Avatar (admin)

**Header (Command Strip, 56px):**
- Breadcrumb: "Hardware"
- Status-Badges: `0 Online` (gruen), `0 Offline` (rot)
- Filter-Buttons: `Alle 0`, `Mock 0`, `Real 0`
- Action-Buttons: Mock, Geraete, Farb-Legende, Alerts, Notifications, NOT-AUS
- Server-Status: "Server verbunden" (gruen)

**Main Content Tabs (ViewTabBar):**
- Uebersicht (`/hardware`) - Zone Accordion mit DeviceMiniCards
- Monitor (`/monitor`) - Zonen-Sensoren, Automatisierungen, Custom Dashboards
- Editor (`/editor`) - Dashboard Builder mit Widgets

### 2.2 Empty State (keine Geraete)

Wenn keine ESP-Geraete vorhanden:
- Plus-Icon (gross, zentriert)
- Heading: "Keine ESP-Geraete"
- Text: "Erstellen Sie Ihr erstes Mock-ESP32-Geraet, um mit dem Testen zu beginnen."
- Button: "Geraet erstellen"

### 2.3 Farb-Legende (6 Status)

| Farbe | Status | Bedeutung |
|-------|--------|-----------|
| Gruen | Online / OK | Geraet verbunden, Wert im Normalbereich |
| Gelb | Warnung | Schwellwert nah oder Sensor-Drift erkannt |
| Rot | Alarm / Fehler | Schwellwert ueberschritten oder Geraet offline |
| Grau | Keine Daten | Deaktiviert oder keine Verbindung |
| Violett | Test-Geraet | Simuliertes ESP (Mock) fuer Entwicklung |
| Cyan | Hardware-Geraet | Echtes ESP32-Geraet (Real) |

### 2.4 Geraeteverwaltung-Dialog

3 Tabs:
1. **Geraete** - Suchfeld + Geraete-Liste (leer: "Erstelle ein Mock-ESP oder verbinde ein echtes Geraet")
2. **Wartend** - Pending Devices zur Genehmigung (Counter angezeigt)
3. **Anleitung** - 4-Schritte-Prozess: Firmware flashen → Provisioning → Auto-Discovery → Freigabe

---

## 3. Mock ESP erstellen - Dialog-Analyse

### 3.1 Verfuegbare Einstellungen

| Feld | Typ | Default | Validierung |
|------|-----|---------|-------------|
| ESP ID | Text (monospace) | `MOCK_XXXXXXXX` (auto-generiert) | Pflichtfeld, Format MOCK_ + 8 Hex-Chars |
| Zone-Name | Text | leer (optional) | Freitext, z.B. "Zelt 1, Gewaechshaus Nord" |
| Auto-Heartbeat | Checkbox | aktiviert | - |
| Heartbeat-Intervall | Number (spinbutton) | 60 Sekunden | min=5, max=300 |

**Buttons:**
- "Neue ID generieren" (RefreshCw Icon) - regeneriert zufaellige Hex-ID
- "Abbrechen" (btn-secondary)
- "Erstellen" (btn-primary, gradient iridescent) - disabled wenn kein esp_id oder isCreating

### 3.2 Was wird NICHT im Dialog konfiguriert

- **Sensoren** - `sensors: []` wird leer uebergeben (spaeter ueber SensorConfigPanel)
- **Aktoren** - `actuators: []` wird leer uebergeben (spaeter ueber ActuatorConfigPanel)
- **Hardware-Typ** - automatisch `MOCK_ESP32`
- **IP/MAC** - nicht relevant fuer Mock
- **Subzone** - nicht im Dialog, kann spaeter gesetzt werden

### 3.3 Erstellungs-Flow (Code)

```
CreateMockEspModal.createEsp()
  → espStore.createDevice(config: MockESPCreate)
    → espApi.createDevice(config)
      → isMockEsp(config.esp_id) → true
        → debugApi.createMockEsp(config)  // POST /debug/mock-esp
          → Server: In-Memory Store + DB Registration
```

### 3.4 MockESPCreate Type-Definition

```typescript
interface MockESPCreate {
  esp_id: string              // MOCK_XXXXXXXX
  zone_id?: string            // Technical zone ID (auto-generated)
  zone_name?: string          // Human-readable name
  master_zone_id?: string     // Parent zone
  subzone_id?: string         // Subzone
  sensors?: MockSensorConfig[]    // Leer bei Erstellung
  actuators?: MockActuatorConfig[] // Leer bei Erstellung
  auto_heartbeat?: boolean    // Default: true
  heartbeat_interval_seconds?: number // Default: 60
}
```

---

## 4. Monitor-View (/monitor)

- Zone-Uebersicht: "0 Zonen · 0/0 Sensoren online"
- Empty State: "Keine Zonen vorhanden"
- Aktive Automatisierungen (0): Link zum Regeln-Tab
- Dashboards (1): "Cross-Zone Temperatur-Vergleich" (2 Widgets)
- Sidebar: Sensor-Comboboxen fuer Zeitreihen-Auswahl

## 5. Editor-View (/editor) — Dashboard Builder

- **GridStack.js** basiert: 12-Spalten-Raster, cellHeight 80px, margin 8px
- 2 Modi: **Edit** (Widgets verschieben/resize/loeschen) und **View** (gesperrt)
- Widget-Catalog-Sidebar: Drag-to-add aus Kategorien-Panel
- Templates: `zone-overview`, `sensor-detail`, `multi-sensor-compare`, `empty`
- Import/Export als JSON, Auto-Save (debounced 2s)
- Vorhandenes Dashboard: "Cross-Zone Temperatur-Vergleich"

### 9 Widget-Typen

| Typ | Komponente | Default-Groesse | Kategorie |
|-----|-----------|-----------------|-----------|
| `line-chart` | LineChartWidget | 6x4 | Sensoren |
| `gauge` | GaugeWidget | 3x3 | Sensoren |
| `sensor-card` | SensorCardWidget | 3x2 | Sensoren |
| `historical` | HistoricalChartWidget | 6x4 | Sensoren |
| `multi-sensor` | MultiSensorWidget | 8x5 | Sensoren |
| `actuator-card` | ActuatorCardWidget | 3x2 | Aktoren |
| `actuator-runtime` | ActuatorRuntimeWidget | 4x3 | Aktoren |
| `esp-health` | ESPHealthWidget | 6x3 | System |
| `alarm-list` | AlarmListWidget | 4x4 | System |

### Dashboard-Target-System (Einbettung)

Dashboards koennen in verschiedenen Views eingebettet werden:
- `target.view=monitor` + `placement=inline` → Inline im Monitor
- `target.view=monitor` + `placement=side-panel` → Sidebar-Panel
- `target.view=monitor` + `placement=bottom-panel` → Bottom-Panel
- `target.view=hardware` → In HardwareView eingebettet

---

## 6. CSS/Design-System Analyse

### 6.1 Design Tokens (tokens.css)

**Farbschema (Dark-Only):**
- Background: 4-stufige Hierarchie (`#07070d` → `#1d1d2a`)
- Text: 3-stufig (`#eaeaf2` primary → `#484860` muted)
- Accent: Blau (`#3b82f6`) mit bright/dim Varianten
- Iridescent: Gradient `#60a5fa` → `#818cf8` → `#a78bfa` → `#c084fc`
- Status: success `#34d399`, warning `#fbbf24`, error `#f87171`, info `#60a5fa`
- Mock vs Real: `--color-mock: #a78bfa` (violett), `--color-real: #22d3ee` (cyan)

**Spacing:** 4px Grid (space-1=4px bis space-12=48px)
**Radius:** 3 Stufen (sm=6px, md=10px, lg=16px)
**Elevation:** 3 Stufen (flat, raised, floating)
**Transitions:** fast=120ms, base=200ms, slow=350ms mit cubic-bezier
**Z-Index:** 12-stufige Skala (base=0 bis safety=75)
**Typography:** Outfit (sans), JetBrains Mono (code), 7 Groessen (11px-32px)

### 6.2 Glass-Morphismus (glass.css)

- `.glass-panel` - backdrop-filter blur(12px), subtile Border
- `.glass-overlay` - Modal-Backdrop mit Blur
- `.iridescent-border` - Gradient-Border fuer Premium-Elemente
- `.water-reflection` - Shimmer-Animation (4s loop)
- `.card-glass` - Kombination aus Card + Glass

### 6.3 Form-Styles (forms.css)

- `.modal-overlay/content/header/body/footer` - Konsistentes Modal-Pattern
- `.form-row` - Grid 2-spaltig
- `.form-group` - Flexbox Column mit Gap
- `.form-input/.form-select` - Background `bg-tertiary`, Border `glass-border`, Focus → accent
- `.btn-primary/.btn-secondary` - In main.css definiert
- `.alert--error/.alert--success` - Farbkodierte Meldungen

### 6.4 Animationen (animations.css, 18 Keyframes)

| Animation | Verwendung |
|-----------|------------|
| `shimmer` | Water-Reflection Sweep |
| `skeleton-loading` | Lade-Skeleton |
| `pulse-dot` | Status-Indikatoren |
| `pulse-glow` | Live-Status mit Shadow |
| `fade-in` | Generischer Einblend-Effekt |
| `slide-up` | Staggered Page Load (6 Stufen) |
| `scale-in` | Modals, Popovers |
| `breathe` | Quality LED excellent |
| `value-flash` | Sensor-Wertaenderung |
| `iridescent-pulse` | Pending Devices Button |
| `pulse-emergency` | NOT-AUS Animation |
| `logo-breathe` | Auth Page Logo |
| `particle-drift` | Auth Page Hintergrund |
| `login-success` | Login-Erfolg Card-Exit |

### 6.5 CreateMockEspModal spezifische Styles

Das Modal nutzt sowohl globale (`forms.css`) als auch scoped Styles:
- `.modal-overlay` - Fixed, Inset 0, rgba(10,10,15,0.8) + blur(4px)
- `.modal-content` - max-width 28rem, bg-secondary, glass-border, radius 0.75rem
- `.error-alert` - rgba(248,113,113,0.1) Background
- `.checkbox` - 1rem, checked → iridescent-1 Farbe
- Buttons: `btn-primary` (iridescent gradient), `btn-secondary` (transparent)

---

## 7. Relevante Funktionen & Composables

### 7.1 ESP Store (esp.ts)

| Funktion | Beschreibung |
|----------|--------------|
| `createDevice(config)` | Erstellt Mock/Real ESP via espApi |
| `fetchAll()` | Laedt alle Geraete (Mock + DB) |
| `deleteDevice(espId)` | Loescht mit Fallback (Debug-Store → DB) |
| `updateDeviceZone()` | Zone-Zuweisung per Drag & Drop |
| `emergencyStopAll()` | NOT-AUS fuer alle Aktoren |
| `approveDevice()` / `rejectDevice()` | Pending Device Workflow |

### 7.2 ESP API Client (esp.ts) — Unified Routing

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| `listDevices()` | GET `/debug/mock-esp` + GET `/esp/devices` | Merged Mock + Real |
| `createDevice()` | POST `/debug/mock-esp` (Mock) oder POST `/esp/devices` (Real) | Routing via `isMockEsp()` |
| `getDevice()` | GET `/debug/mock-esp/:id` oder GET `/esp/devices/:id` | Mit Orphan-Fallback |
| `deleteDevice()` | DELETE `/debug/mock-esp/:id` mit DB-Fallback | Handles orphaned Mocks |
| `getHealth()` | In-Memory (Mock) oder GET `/esp/devices/:id/health` | Metriken |
| `getGpioStatus()` | GET `/esp/devices/:id/gpio-status` | GPIO-Verfuegbarkeit |
| `getPendingDevices()` | GET `/esp/devices/pending` | Discovery-Workflow |

### 7.2b Debug API — Vollstaendige Mock-ESP-Operationen (debug.ts)

| Methode | HTTP | Endpoint |
|---------|------|----------|
| `createMockEsp(config)` | POST | `/debug/mock-esp` |
| `listMockEsps()` | GET | `/debug/mock-esp` |
| `getMockEsp(id)` | GET | `/debug/mock-esp/{id}` |
| `deleteMockEsp(id)` | DELETE | `/debug/mock-esp/{id}` |
| `triggerHeartbeat(id)` | POST | `/debug/mock-esp/{id}/heartbeat` |
| `setState(id, state)` | POST | `/debug/mock-esp/{id}/state` |
| `setAutoHeartbeat(id, en, sec)` | POST | `/debug/mock-esp/{id}/auto-heartbeat` |
| `addSensor(id, config)` | POST | `/debug/mock-esp/{id}/sensors` |
| `setSensorValue(id, gpio, val)` | POST | `/debug/mock-esp/{id}/sensors/{gpio}` |
| `removeSensor(id, gpio)` | DELETE | `/debug/mock-esp/{id}/sensors/{gpio}` |
| `addActuator(id, config)` | POST | `/debug/mock-esp/{id}/actuators` |
| `setActuatorState(id, gpio, st)` | POST | `/debug/mock-esp/{id}/actuators/{gpio}` |
| `emergencyStop(id, reason)` | POST | `/debug/mock-esp/{id}/emergency-stop` |
| `clearEmergency(id)` | POST | `/debug/mock-esp/{id}/clear-emergency` |

### 7.3 Key Helper Functions

- `isMockEsp(id)` - Prueft Prefix `ESP_MOCK_` oder `MOCK_`
- `normalizeEspId(device)` - Extrahiert device_id/esp_id
- `generateEspId()` - Random `MOCK_` + 8 Hex-Chars
- `enrichDbDevicesWithSensors()` - Bindet Sensor-Configs an DB-Devices
- `enrichDbDevicesWithActuators()` - Bindet Actuator-Configs an DB-Devices
- `mapSensorConfigToMockSensor()` - SensorConfig → MockSensor Format
- `getESPStatus()` - Unified Status-Berechnung (from useESPStatus)

### 7.4 HardwareView Composables & WebSocket

- `useZoneDragDrop` - Zone Drag & Drop mit generateZoneId, handleDeviceDrop
- `useKeyboardShortcuts` - Keyboard Navigation
- `useSwipeNavigation` - Mobile Swipe-Zurueck (Level 2 → Level 1)
- `useToast` - Notification-System
- `useDashboardWidgets` - Widget-Rendering: `createWidgetElement()` → `mountWidgetToElement()` → `unmountWidgetFromElement()`
- `useESPStatus` - Single Source of Truth fuer ESP-Status (pure function `getESPStatus()`)
- `useSparklineCache` - Sparkline-Daten-Cache fuer Monitor-View

**ESP Store WebSocket-Subscriptions (26 Event-Typen):**
`esp_health`, `sensor_data`, `actuator_status`, `actuator_alert`, `config_response`,
`zone_assignment`, `subzone_assignment`, `sensor_health`, `device_discovered`,
`device_approved`, `device_rejected`, `device_rediscovered`, `actuator_response`,
`actuator_command`, `actuator_command_failed`, `config_published`, `config_failed`,
`sequence_started/step/completed/error/cancelled`, `logic_execution`,
`notification`, `error_event`, `system_event`

### 7.5 HardwareView Navigation

```
Level 1: /hardware          → Zone Accordion (ZonePlate + DeviceMiniCard)
Level 2: /hardware/:zoneId/:espId → DeviceDetailView (Orbital Layout)
```

Accordion-State wird in localStorage persistiert (`ao-zone-collapse-{zoneId}`).
Zonen mit Offline-Devices werden automatisch expanded.

---

## 8. Zusammenfassung

Das Dashboard ist ein ausgereiftes Dark-Theme IoT-Control-Panel mit:
- **3-Tab-Navigation** (Uebersicht/Monitor/Editor) fuer verschiedene Perspektiven
- **Mock-ESP-System** das simulierte Geraete komplett ueber REST API verwaltet
- **Konsistentes Design-System** basierend auf CSS Custom Properties (tokens.css)
- **Glassmorphismus-Effekte** fuer Premium-Look (glass.css)
- **18+ Animationen** fuer lebendige UI (animations.css)
- **Unified ESP API** die Mock- und Real-Geraete transparent handhabt
- **Drag & Drop** fuer Zone-Zuweisung
- **Discovery-Workflow** fuer echte ESP32-Geraete (Wartend → Genehmigen)

Der Mock-Erstellen-Dialog ist bewusst minimal gehalten (4 Felder).
Sensoren und Aktoren werden erst nach Erstellung ueber separate Config-Panels hinzugefuegt.

---

## 9. Ghost-Mock-Analyse (Browser-Verifikation 2)

### 9.1 Befund: Phantom `MOCK_3410D29D`

**Beobachtung im Frontend (2. Browser-Session):**
- Dashboard zeigt `0 Online`, `0 Offline`, `Alle 0`, `Mock 0`, `Real 0`
- ABER: Button "1 offen" statt "Geraete" → 1 Pending Device
- Tab "Wartend 1" zeigt: `MOCK_3410D29D` mit Status "Gut" und "gerade eben"
- Alerts gestiegen: 2 statt vorher 1 (Grafana Webhook: "Sensordaten veraltet")

**Beobachtung in Server-Logs:**
```
[AUTO-HB] MOCK_3410D29D heartbeat published (state=SAFE_MODE)  -- alle 60s
[MOCK_3410D29D] Sensor 0_sht31 not in config                   -- alle 30s
[MOCK_3410D29D] Sensor 4_DS18B20 not in config                 -- alle 30s
```

### 9.2 Datenbank-IST-Zustand

```sql
SELECT device_id, hardware_type, status, zone_id FROM esp_devices;

   device_id   | hardware_type |      status      | zone_id
---------------+---------------+------------------+---------
 MOCK_3410D29D | ESP32_WROOM   | pending_approval |
(1 row)

SELECT COUNT(*) FROM sensor_data;  -- 0 rows (cleanup durchgefuehrt)
```

### 9.3 Root Cause: 2-Bug-Kette

**Bug 1 — Falscher `hardware_type` bei Auto-Discovery:**

Datei: `heartbeat_handler.py:_auto_register_esp()` (Zeile ~379)
```python
new_esp = ESPDevice(
    device_id=esp_id,
    hardware_type="ESP32_WROOM",  # BUG: Hardcoded, erkennt MOCK_ Prefix nicht
    status="pending_approval",
    ...
)
```

Die `list_mock_esps` API filtert via `esp_repo.get_all_mock_devices()` nach
`hardware_type = 'MOCK_ESP32'` → findet `MOCK_3410D29D` mit `ESP32_WROOM` NICHT.

**Bug 2 — SimulationScheduler ueberlebt DB-Cleanup:**

Der Scheduler laeuft im RAM und sendet weiter Heartbeats/Sensor-Daten fuer
geloeschte Devices. Die Heartbeat-Handler Auto-Discovery re-registriert den
Ghost mit falschen Attributen.

### 9.4 Chronologischer Ablauf

| Zeit | Ereignis |
|------|----------|
| 10:59:59 | Server-Start, SimulationScheduler initialisiert |
| 11:01:24 | `Admin admin created mock ESP: MOCK_3410D29D` (debug API) |
| 11:01:24 | Simulation gestartet: heartbeat 60s, 0 sensors, 0 actuators |
| 11:01:24 | Emergency Stop ausgeloest → SAFE_MODE |
| ~12:00 | User loescht DB-Daten (Backup: `automationone_pre_cleanup_20260307_114106.sql.gz`) |
| 12:42:24 | Heartbeat-Handler empfaengt Heartbeat von MOCK_3410D29D |
| 12:42:24 | `_auto_register_esp()` → neuer DB-Record mit `ESP32_WROOM` + `pending_approval` |
| 12:42+ | Frontend sieht 0 Mocks (Filter nach MOCK_ESP32), aber 1 Pending Device |
| laufend | Scheduler warnt: "Sensor not in config" (alle 15s, 2 Sensoren) |

### 9.5 Fix-Vorschlaege (chirurgisch)

**Fix 1 (heartbeat_handler.py) — MOCK-Prefix-Erkennung:**
```python
# In _auto_register_esp(), Zeile ~379:
hardware_type = "MOCK_ESP32" if esp_id.startswith("MOCK_") or esp_id.startswith("ESP_MOCK_") else "ESP32_WROOM"
```

**Fix 2 (scheduler.py) — Cleanup bei DB-Delete:**
Wenn ein Mock-Device via API geloescht wird, muss der Scheduler
die In-Memory-Simulation ebenfalls stoppen.

**Fix 3 (heartbeat_handler.py) — Auto-Approve fuer bekannte Mocks:**
Mock-ESPs (`MOCK_*` Prefix) sollten bei Re-Discovery automatisch
genehmigt werden statt `pending_approval` zu bekommen.

---

## 10. Alle Server-Errors (Log-Zusammenfassung)

### 10.1 ERRORS (schwerwiegend)

| Zeit | Quelle | Error | Beschreibung |
|------|--------|-------|--------------|
| 11:00:00 | `src.main` | `God-Kaiser init failed` | `can't subtract offset-naive and offset-aware datetimes` — Timezone-Bug bei Startup |
| 11:03:52 | `src.middleware` | `MissingGreenlet` | SQLAlchemy async Greenlet-Fehler auf `GET /api/v1/zone/zones` |
| 12:24:01 | `src.middleware` | `MissingGreenlet` | Gleicher Greenlet-Fehler, wiederholt auf Zone-Endpoint |
| 12:27:54 | `src.middleware` | `MissingGreenlet` | 3. Auftreten — wahrscheinlich lazy-loaded Relationship ausserhalb async Context |

### 10.2 WARNINGS (funktional relevant)

| Zeit | Quelle | Warning | Haeufigkeit |
|------|--------|---------|-------------|
| laufend | `simulation.scheduler` | `[MOCK_3410D29D] Sensor 0_sht31 not in config` | Alle ~30s |
| laufend | `simulation.scheduler` | `[MOCK_3410D29D] Sensor 4_DS18B20 not in config` | Alle ~30s |
| 11:00:59 | `exception_handlers` | `ESP_NOT_FOUND - MOCK_3D6C5444 not found` | 4x (alter Ghost) |
| 12:43:19 | `exception_handlers` | `ESP_NOT_FOUND - MOCK_10C0608E not found` | 1x (Dialog-Preview?) |
| 12:46:58 | `notification_router` | `Sensordaten veraltet` | Grafana Webhook Alert |
| 12:48:15+ | `api.deps` | `No authentication token provided` | Meine curl-Versuche |
| 12:48:57 | `api.deps` | `JWT verification failed: Not enough segments` | Mein fehlerhafter Token |

### 10.3 Loki-Status

- Loki erreichbar unter `http://localhost:3100`
- Labels: `compose_service` mit 12 Services (el-servador, el-frontend, mqtt-broker, etc.)
- Kein `god_kaiser` Job konfiguriert — Logs kommen ueber Docker/Alloy als `compose_service=el-servador`
- Loki-Query fuer Server-Logs: `{compose_service="el-servador"}`

### 10.4 DB-Zustand nach Cleanup

```
esp_devices:  1 Record (MOCK_3410D29D, falsch registriert)
sensor_data:  0 Rows (komplett bereinigt)
Backup:       backups/automationone_pre_cleanup_20260307_114106.sql.gz
```

---

## 11. Backup-Analyse (Pre-Cleanup Snapshot)

> **Datei:** `backups/automationone_pre_cleanup_20260307_114106.sql.gz`
> **Groesse:** 1.3 MB komprimiert → 6.6 MB unkomprimiert (42.352 Zeilen)
> **Zeitpunkt:** 2026-03-07 11:41:06

### 11.1 ESP Devices im Backup (7 Stueck)

| device_id | Name | Zone | Status | Sensoren | Aktoren | hardware_type |
|-----------|------|------|--------|----------|---------|---------------|
| MOCK_95A49FCB | Mock #9FCB | Test | offline | 4 (pH, SHT31×2, DS18B20) | 2 (Pump×2) | MOCK_ESP32 |
| MOCK_57A7B22F | Mock #B22F | Testneu | **online** | 1 (DS18B20) | 0 | MOCK_ESP32 |
| MOCK_3D6C5444 | Mock #5444 | Test | **online** | 1 (SHT31) | 0 | MOCK_ESP32 |
| MOCK_495D6D92 | Mock #6D92 | Test | offline | 0 (leer) | 0 | MOCK_ESP32 |
| MOCK_0CBACD10 | Mock #CD10 | *(keine)* | offline | 2 (DS18B20, SHT31) | 1 (Relay) | MOCK_ESP32 |
| MOCK_10C0608E | Mock #608E | Testneu | offline | 2 (SHT31, pH) | 0 | MOCK_ESP32 |
| MOCK_98D427EA | Mock #27EA | Testneu | offline | 1 (SHT31) | 2 (Pump, Relay) | MOCK_ESP32 |

**Kritisch:** `MOCK_3410D29D` existiert NICHT im Backup. Er wurde erst NACH dem Cleanup durch den Heartbeat-Handler als Ghost-Mock mit falschem `hardware_type=ESP32_WROOM` auto-registriert.

### 11.2 Datenmengen im Backup

| Tabelle | Rows | Beschreibung |
|---------|------|--------------|
| sensor_data | ~29.317 | Sensor-Messwerte (26.02. - 07.03.2026) |
| esp_heartbeat_logs | ~9.723 | Heartbeat-Protokolle |
| audit_logs | ~250 | Events (device_offline, discovered, approved, mqtt_error) |
| sensor_configs | 17 | Sensor-Konfigurationen ueber 6 ESPs |
| actuator_configs | 2 | Pumpe Test (MOCK_0CBACD10), Ventil Testneu (MOCK_98D427EA) |
| notifications | ~257 | User-Benachrichtigungen |

### 11.3 Sensor-Konfiguration Detail

| ESP | GPIO | Typ | Name | Interface | Subzone | Status |
|-----|------|-----|------|-----------|---------|--------|
| MOCK_0CBACD10 | 4 | DS18B20 | Temp 0C79 | ONEWIRE | — | applied |
| MOCK_0CBACD10 | 0 | SHT31 | SHT31_0 | I2C (0x44) | — | applied |
| MOCK_95A49FCB | 32 | pH | pH Wassertank | ANALOG | test_reihe_1 | active |
| MOCK_95A49FCB | 0 | SHT31 | SHT31_0 | I2C (0x44) | — | active |
| MOCK_95A49FCB | 0 | sht31 | sht31_0 | I2C (0x45) | — | active |
| MOCK_95A49FCB | 4 | DS18B20 | Temp 0C79 | ONEWIRE | — | active |
| MOCK_57A7B22F | 4 | DS18B20 | Temp2 Testneu | ONEWIRE | — | applied |
| MOCK_98D427EA | 21 | SHT31 | Temp Testneu | I2C (0x44) | — | applied |
| MOCK_3D6C5444 | 0 | SHT31 | SHT31_0 | I2C (0x44) | — | active |
| MOCK_10C0608E | 0 | SHT31 | SHT31_0 | I2C (0x44) | FINALERSUBTEST | active |
| MOCK_10C0608E | 32 | pH | pH_32 | ANALOG | — | active |

Plus 6 pi_enhanced Split-Configs (sht31_temp/sht31_humidity) mit Status `pending`.

### 11.4 Historische Mock-Spuren (nur in audit_logs)

Diese Mocks existierten frueher, wurden bereits vor dem Backup geloescht — nur Audit-Log-Spuren sind geblieben:

| device_id | Letztes Event | Beschreibung |
|-----------|---------------|--------------|
| MOCK_1F8A1C68 | 2026-02-27 00:45 | device_offline (3× im Log) |
| MOCK_CHAOS01 | 2026-02-28 08:14 | discovered → approved → online → LWT disconnect |
| MOCK_DISCOVER01 | 2026-02-28 08:14 | device_discovered (1× im Log) |
| MOCK_0954B2B1 | *(nicht im Backup)* | War bereits durch cleanup_phase5.sql entfernt |

### 11.5 MQTT-Errors im Backup

| ESP | Error Code | Kategorie | Beschreibung |
|-----|-----------|-----------|--------------|
| MOCK_0CBACD10 | 1023 | HARDWARE | ROM-Code muss genau 16 Hex-Zeichen lang sein |
| MOCK_0CBACD10 | 1002 | HARDWARE | GPIO 5 Pin-Konflikt |
| MOCK_0CBACD10 | 9999 | UNKNOWN | Unknown test error |
| MOCK_98D427EA | 3014 | COMMUNICATION | MQTT-Verbindung verloren |
| MOCK_95A49FCB | 2014 | SERVICE | Konfiguration enthaelt ungueltige Werte |

### 11.6 Root-Cause Bestaetigung

Das Backup bestaetigt die Ghost-Mock-Analyse aus Sektion 9:

1. **Alle 7 Backup-Mocks** haben korrekten `hardware_type = MOCK_ESP32`
2. **MOCK_3410D29D existiert NICHT** im Backup → wurde erst nach Cleanup erstellt
3. **SimulationScheduler laeuft In-Memory** → ueberlebt DB-Cleanup
4. **heartbeat_handler auto-registriert** mit falschem `hardware_type = ESP32_WROOM`
5. **29.317 sensor_data Rows** + **9.723 heartbeat_logs** = erhebliche Datenmenge bereinigt

### 11.7 Zonen-Verteilung (Backup)

```
Zone "Test":     3 Devices (MOCK_95A49FCB, MOCK_3D6C5444, MOCK_495D6D92)
Zone "Testneu":  3 Devices (MOCK_57A7B22F, MOCK_10C0608E, MOCK_98D427EA)
Ohne Zone:       1 Device  (MOCK_0CBACD10)
```

### 11.8 Empfehlung

Das Backup ist vollstaendig und konsistent. Die 7 Mocks mit ~29K Sensor-Readings und ~9.7K Heartbeats repraesentieren ca. 8 Tage Simulationsdaten (26.02. - 07.03.2026). Die bereinigten Daten koennten bei Bedarf gezielt wiederhergestellt werden — einzelne Devices via `INSERT INTO esp_devices ... WHERE device_id = 'MOCK_xxx'` aus dem SQL-Dump extrahierbar.
