# Zone/Subzone-Architektur Vollanalyse

> **Datum:** 2026-02-26
> **Priorität:** P0 (BLOCKER-Klärung)
> **Ergebnis:** Hypothese BESTÄTIGT — Zonen sind String-Felder, KEIN eigenständiges DB-Objekt

---

## Zusammenfassung (Executive Summary)

**Die Hypothese ist korrekt:** Zonen sind KEINE eigenständigen DB-Entitäten. Sie existieren als String-Felder (`zone_id`, `zone_name`, `master_zone_id`) auf der `esp_devices`-Tabelle. Subzonen hingegen SIND eigenständige DB-Entitäten mit eigener Tabelle (`subzone_configs`).

**Der "Zone-CRUD BLOCKER" ist ein Phantom-Blocker.** Das bestehende Assignment-System ist vollständig funktional und wird aktiv genutzt. Es fehlen nur Zone-Metadaten (description, icon, color) — NICHT das CRUD selbst.

**Szenario B bestätigt** (mit Nuance): Zonen sind String-Felder am ESP, aber das System hat bereits vollständige Zone-Assignment-APIs, WebSocket-Events und Frontend-Integration. Kein 6-10h Backend-Aufwand nötig.

---

## Block 1: Datenmodell (F1-F3)

### F1: Gibt es eine `zones`-Tabelle?

**NEIN.** Es gibt keine `zones`-Tabelle in der Datenbank.

Zone-Daten sind String-Felder auf `esp_devices`:

```
esp_devices (Tabelle)
├── zone_id          VARCHAR(50)   NULLABLE, INDEX    — "greenhouse_zone_1"
├── zone_name        VARCHAR(100)  NULLABLE           — "Gewächshaus Sektion 1"
├── master_zone_id   VARCHAR(50)   NULLABLE, INDEX    — "greenhouse_master"
├── is_zone_master   BOOLEAN       DEFAULT FALSE      — Zone-Master-Flag
└── kaiser_id        VARCHAR(50)   NULLABLE, INDEX    — "god"
```

**Quelle:** [esp.py](El Servador/god_kaiser_server/src/db/models/esp.py) Zeilen 66-100

**Alembic-Migration:** `add_master_zone_id_to_esp_device.py` — fügte `master_zone_id` + Index hinzu (basiert auf bestehender `zone_id`-Spalte).

### F2: Gibt es eine `subzone_configs`-Tabelle?

**JA.** Subzonen sind eigenständige DB-Entitäten.

```
subzone_configs (Tabelle)
├── id               UUID          PK
├── esp_id           VARCHAR(50)   FK→esp_devices.device_id, INDEX, NOT NULL
├── subzone_id       VARCHAR(50)   INDEX, NOT NULL     — "irrigation_section_A"
├── subzone_name     VARCHAR(100)  NULLABLE            — "Bewässerung Sektion A"
├── parent_zone_id   VARCHAR(50)   INDEX, NOT NULL     — muss ESP's zone_id matchen
├── assigned_gpios   JSON          NOT NULL            — [4, 5, 6]
├── safe_mode_active BOOLEAN       DEFAULT TRUE
├── sensor_count     INTEGER       DEFAULT 0
├── actuator_count   INTEGER       DEFAULT 0
├── last_ack_at      DATETIME      NULLABLE
├── created_at       DATETIME      (TimestampMixin)
└── updated_at       DATETIME      (TimestampMixin)
    UNIQUE(esp_id, subzone_id)
```

**Quelle:** [subzone.py](El Servador/god_kaiser_server/src/db/models/subzone.py)
**Migration:** `add_subzone_configs_table.py`

**Hierarchie:** `ESP → Zone (String) → Subzone (DB-Tabelle) → GPIO Pins`

Subzone hat eine `relationship` zurück zum ESP:
```python
esp: Mapped["ESPDevice"] = relationship("ESPDevice", back_populates="subzones")
```

### F3: Wie werden Zonen erstellt/gelöscht?

**Zone erstellen = Implizit.** Beim ersten `POST /v1/zone/devices/{esp_id}/assign` mit einem neuen `zone_id` wird die Zone "erstellt" — es werden lediglich die String-Felder am ESP-Device gesetzt.

**Zone löschen = Implizit.** Wenn der letzte ESP aus einer Zone entfernt wird (via `DELETE /v1/zone/devices/{esp_id}/zone`), "verschwindet" die Zone — weil kein Device mehr diesen `zone_id`-String trägt.

**Cascade-Verhalten:** Bei Zone-Removal werden automatisch alle Subzones gelöscht:
```python
# zone_service.py:237-244
subzone_repo = SubzoneRepository(self.esp_repo.session)
deleted_count = await subzone_repo.delete_all_by_zone(old_zone_id)
```

**Es gibt KEIN Zone-Lifecycle-Management.** Keine Zone-Erstellung, keine Zone-Löschung als eigenständige Operationen.

---

## Block 2: REST-API Endpoints (F4-F5)

### F4: Zone-Endpoints (TATSÄCHLICH vorhanden)

Router-Prefix: `/v1/zone` — Registriert in [\_\_init\_\_.py](El Servador/god_kaiser_server/src/api/v1/__init__.py)

| Methode | Pfad | Handler | Funktion |
|---------|------|---------|----------|
| POST | `/v1/zone/devices/{esp_id}/assign` | `assign_zone()` | ESP einer Zone zuweisen (DB + MQTT) |
| DELETE | `/v1/zone/devices/{esp_id}/zone` | `remove_zone()` | Zone-Zuweisung entfernen (DB + MQTT + Subzone-Cascade) |
| GET | `/v1/zone/devices/{esp_id}` | `get_zone_info()` | Zone-Info für ein ESP |
| GET | `/v1/zone/{zone_id}/devices` | `get_zone_devices()` | Alle ESPs in einer Zone |
| GET | `/v1/zone/unassigned` | `get_unassigned_devices()` | ESPs ohne Zone-Zuweisung |

**NICHT vorhanden:**

| Methode | Pfad | Status |
|---------|------|--------|
| GET | `/v1/zones` | ❌ Existiert nicht — Zone-Liste wird frontend-seitig aus Devices computed |
| POST | `/v1/zones` | ❌ Existiert nicht — Zonen entstehen implizit |
| PUT | `/v1/zones/{id}` | ❌ Existiert nicht — Zone-Umbenennung = alle ESPs neu zuweisen |
| DELETE | `/v1/zones/{id}` | ❌ Existiert nicht — Zone verschwindet wenn leer |

**Quelle:** [zone.py](El Servador/god_kaiser_server/src/api/v1/zone.py)

### F5: Subzone-Endpoints (TATSÄCHLICH vorhanden)

Router-Prefix: `/v1/subzone`

| Methode | Pfad | Handler | Funktion |
|---------|------|---------|----------|
| POST | `/v1/subzone/devices/{esp_id}/subzones/assign` | `assign_subzone()` | GPIOs einer Subzone zuweisen |
| DELETE | `/v1/subzone/devices/{esp_id}/subzones/{subzone_id}` | `remove_subzone()` | Subzone entfernen |
| GET | `/v1/subzone/devices/{esp_id}/subzones` | `get_subzones()` | Alle Subzones eines ESP |
| GET | `/v1/subzone/devices/{esp_id}/subzones/{subzone_id}` | `get_subzone()` | Einzelne Subzone |
| POST | `/v1/subzone/devices/{esp_id}/subzones/{subzone_id}/safe-mode` | `enable_safe_mode()` | Safe-Mode aktivieren |
| DELETE | `/v1/subzone/devices/{esp_id}/subzones/{subzone_id}/safe-mode` | `disable_safe_mode()` | Safe-Mode deaktivieren |

**Quelle:** [subzone.py](El Servador/god_kaiser_server/src/api/v1/subzone.py)

---

## Block 3: MQTT-Handler (F6)

### Zone MQTT Topics

| Richtung | Topic | Handler | DB-Write? |
|----------|-------|---------|-----------|
| Server → ESP | `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` | — | Ja (ESP-Felder vorab) |
| ESP → Server | `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack` | `ZoneAckHandler` | Ja (bestätigt/korrigiert) |

**ACK-Statuses:** `zone_assigned`, `zone_removed`, `error`

**Payload (Server → ESP):**
```json
{
  "zone_id": "greenhouse_zone_1",
  "master_zone_id": "greenhouse_master",
  "zone_name": "Gewächshaus Sektion 1",
  "kaiser_id": "god",
  "timestamp": 1734523800
}
```

**WebSocket-Broadcast:** `zone_assignment` Event nach ACK-Verarbeitung

### Subzone MQTT Topics

| Richtung | Topic | Handler | DB-Write? |
|----------|-------|---------|-----------|
| Server → ESP | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign` | — | Ja (upsert SubzoneConfig) |
| Server → ESP | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/remove` | — | Nein (wartet auf ACK) |
| Server → ESP | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/safe` | — | Nein (wartet auf ACK) |
| ESP → Server | `kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack` | `SubzoneAckHandler` | Ja (confirm/delete) |

**ACK-Statuses:** `subzone_assigned`, `subzone_removed`, `error` (Error-Codes: 2500-2506)

**WebSocket-Broadcast:** `subzone_assignment` Event nach ACK-Verarbeitung

---

## Block 4: Frontend Zone-Code (F7-F10)

### F7: zone.store.ts (198 Zeilen)

**Kein eigener State.** Der Store ist ein reiner Event-Handler ohne eigene reactive Properties.

Zwei Funktionen:
- `handleZoneAssignment()` — verarbeitet `zone_assignment` WebSocket-Events
- `handleSubzoneAssignment()` — verarbeitet `subzone_assignment` WebSocket-Events

Beide nehmen `devices[]` und `setDevice()` von espStore als Parameter und aktualisieren dort die Device-Objekte. Der WS-Dispatcher in `esp.store.ts` delegiert Zone-Events an diesen Store.

**Quelle:** [zone.store.ts](El Frontend/src/shared/stores/zone.store.ts)

### F8: Wie lädt das Frontend Zone-Daten?

**Zone-Daten kommen ALS TEIL der Device-Response.** Es gibt keinen separaten `fetchZones()` Call.

1. `espStore.fetchAll()` → ruft `espApi.fetchAll()` auf
2. Response enthält pro Device: `zone_id`, `zone_name`, `master_zone_id`, `subzone_id`, `subzone_name`
3. Zone-Liste wird **computed** aus Devices:

```typescript
// useZoneDragDrop.ts:127-162
function groupDevicesByZone(devices: ESPDevice[]): ZoneGrouping[] {
  const zoneMap = new Map<string, ZoneGrouping>()
  // Iteriert alle devices, gruppiert nach device.zone_id
  for (const device of devices) {
    const zoneId = device.zone_id || ZONE_UNASSIGNED
    // ...
  }
  return Array.from(zoneMap.values())
}
```

4. `HardwareView.vue` nutzt: `zoneGroups = computed(() => groupDevicesByZone(filteredEsps.value))`
5. `MonitorView.vue` und `SensorsView.vue` verwenden denselben Ansatz

**Es gibt keinen separaten Zone-API-Call. Die Zone-Liste existiert nur als Frontend-Computed.**

**Quelle:** [useZoneDragDrop.ts](El Frontend/src/composables/useZoneDragDrop.ts) Zeilen 127-162

### F9: subzonesApi im Frontend

**Datei:** [subzones.ts](El Frontend/src/api/subzones.ts) (154 Zeilen)

| Methode | Backend-Endpoint | Aktiv genutzt? |
|---------|------------------|----------------|
| `assignSubzone()` | POST .../subzones/assign | ✅ |
| `removeSubzone()` | DELETE .../subzones/{id} | ✅ |
| `getSubzones()` | GET .../subzones | ✅ |
| `getSubzone()` | GET .../subzones/{id} | ✅ |
| `enableSafeMode()` | POST .../safe-mode | ✅ |
| `disableSafeMode()` | DELETE .../safe-mode | ✅ |

Wird importiert in mehreren Komponenten.

### F10: SubzoneArea-Komponente

**Datei:** [SubzoneArea.vue](El Frontend/src/components/zones/SubzoneArea.vue) (85 Zeilen)

Einfache Presentational-Komponente:
- **Props:** `subzoneId`, `subzoneName`, `devices: ESPDevice[]`
- **Rendert:** Getönte Fläche mit MapPin-Icon, Header, Device-Count-Badge, Slot für Kinder
- **Importiert von:** `ZoneDetailView.vue`
- **Styling:** Glass-BG, Accent-Border-Left, Grid-Layout für Devices

---

## Datenmodell-Diagramm

```
┌──────────────────────────────────────────────────────┐
│                   esp_devices                        │
├──────────────────────────────────────────────────────┤
│  device_id (PK)  │  "ESP_12AB34CD"                  │
│  zone_id         │  "greenhouse_zone_1"    ← STRING  │
│  zone_name       │  "Gewächshaus Sektion 1" ← STRING │
│  master_zone_id  │  "greenhouse_master"    ← STRING  │
│  is_zone_master  │  false                            │
│  kaiser_id       │  "god"                            │
│  ... (sensors, actuators, status, etc.)              │
└──────────────────┬───────────────────────────────────┘
                   │ 1:N (cascade delete)
                   ▼
┌──────────────────────────────────────────────────────┐
│               subzone_configs                        │
├──────────────────────────────────────────────────────┤
│  id (UUID PK)    │                                   │
│  esp_id (FK)     │  → esp_devices.device_id          │
│  subzone_id      │  "irrigation_section_A"           │
│  subzone_name    │  "Bewässerung A"                  │
│  parent_zone_id  │  "greenhouse_zone_1" (= ESP.zone) │
│  assigned_gpios  │  [4, 5, 6]  (JSON)               │
│  safe_mode_active│  true/false                       │
│  sensor_count    │  1                                │
│  actuator_count  │  2                                │
│  UNIQUE(esp_id, subzone_id)                          │
└──────────────────────────────────────────────────────┘

WICHTIG: Es gibt KEINE "zones"-Tabelle!
"Zone" = logische Gruppierung aus Devices mit gleichem zone_id.
```

---

## Frontend-Datenfluss

```
espApi.fetchAll() ──HTTP──▶ Server: GET /v1/esp/devices
                                         │
                                         ▼
                            Response: [...devices mit zone_id, zone_name, ...]
                                         │
                                         ▼
                            espStore.devices = [...] (Pinia State)
                                         │
                                         ▼
                      ┌──────────────────┼──────────────────────┐
                      │                  │                      │
                      ▼                  ▼                      ▼
              HardwareView        MonitorView            SensorsView
              groupDevicesByZone()  groupDevicesByZone()  computed zone groups
                      │                  │                      │
                      ▼                  ▼                      ▼
                ZonePlate[]          ZoneGroup[]         Zone/Subzone-Tabs
                      │
                      ▼
               DeviceMiniCard[]
                      │
                ┌─────┴──────┐
                ▼            ▼
          ZoneDragDrop    ZoneAssign
          (Frontend)      (→ zonesApi → Server → MQTT → ESP)
```

**WebSocket-Updates:**
```
ESP ──MQTT──▶ Server (zone_ack_handler) ──WS──▶ zone.store.handleZoneAssignment()
                                                        │
                                                        ▼
                                               espStore.devices[i] wird aktualisiert
                                                        │
                                                        ▼
                                               Vue-Reactivity: computed() neuberechnet
```

---

## GAP-Analyse: Was fehlt für das Übersicht-Tab-Redesign?

### Was EXISTIERT und funktioniert (✅)

| Feature | Status | Wo |
|---------|--------|-----|
| Zone-Zuweisung (ESP → Zone) | ✅ Vollständig | zonesApi.assignZone() → POST /zone/devices/{id}/assign |
| Zone-Entfernung | ✅ Vollständig | zonesApi.removeZone() → DELETE /zone/devices/{id}/zone |
| Zone-Info pro ESP | ✅ Vollständig | GET /zone/devices/{id} |
| ESPs in Zone auflisten | ✅ Vollständig | GET /zone/{id}/devices |
| Unzugewiesene ESPs | ✅ Vollständig | GET /zone/unassigned |
| Zone-Gruppierung im Frontend | ✅ Vollständig | groupDevicesByZone() computed |
| Drag-Drop zwischen Zonen | ✅ Vollständig | useZoneDragDrop + VueDraggable |
| WebSocket Zone-Updates | ✅ Vollständig | zone_assignment + subzone_assignment Events |
| Subzone CRUD (DB + API + MQTT) | ✅ Vollständig | subzone_configs Tabelle + 6 Endpoints |
| Zone-Umbenennung (über Re-Assignment) | ✅ Funktioniert | assignZone() mit neuem zone_name |
| Mock-ESP Zone-Support | ✅ Vollständig | SimulationScheduler-Integration |

### Was FEHLT (❌)

| Feature | Aufwand | Notwendig für Übersicht-Tab? |
|---------|---------|-------------------------------|
| `GET /v1/zones` — Zone-Liste als API | ~20 LOC Backend (~30min) | **NEIN** — Frontend computed reicht |
| Zone-Metadaten (description, icon, color, sort_order) | ~2-4h Backend (neue Tabelle oder JSON-Config) | **Optional** — nur für erweiterte UI |
| "Leere Zone erstellen" (ohne ESP) | ~1h Backend + Frontend | **NEIN** — widerspricht dem impliziten Design |
| Zone-Level Einstellungen/Preferences | ~4-8h Full-Stack | **NEIN** — Phase 2 Feature |

### Was das Frontend BEREITS kann

- Zonen anzeigen (ZonePlate-Komponenten)
- Zonen-Metriken aggregieren (Temperatur, Humidity, Aktoren)
- Subzonen als Chips/Labels darstellen
- ESPs per Drag-Drop zwischen Zonen verschieben
- Sensor-Quality-Priorisierung in Zonen-Ansicht
- Expand/Collapse pro Zone
- Cross-ESP-Connections pro Zone anzeigen

---

## Empfehlung

### Der "Zone-CRUD BLOCKER" ist KEIN Blocker.

Das bestehende System ist **designbedingt** ohne dedizierte `zones`-Tabelle. Das ist keine Lücke — das ist eine bewusste Architektur-Entscheidung:

1. **"Zone erstellen"** = Einem ESP einen neuen zone_id zuweisen → **funktioniert bereits**
2. **"Zone umbenennen"** = Allen ESPs in der Zone einen neuen zone_name zuweisen → **funktioniert bereits** (loop über `GET /zone/{id}/devices` + `POST /zone/devices/{id}/assign` für jeden)
3. **"Zone löschen"** = Alle ESPs aus der Zone entfernen → **funktioniert bereits**
4. **"Zone-Liste"** = Frontend groupDevicesByZone() → **funktioniert bereits**

### Konkreter Vorschlag für das Übersicht-Tab

**SOFORT machbar (0h Backend-Arbeit):**
- Übersicht-Tab kann mit dem bestehenden System gebaut werden
- Zonen-Kacheln aus `groupDevicesByZone()` computed
- Zone-Assignment über `zonesApi.assignZone()` / `removeZone()`
- Drag-Drop mit `useZoneDragDrop`

**Optional für UX-Verbesserung (~2-4h):**
- Leichtgewichtige `zone_metadata`-Tabelle oder JSON-Config für:
  - Zone-Beschreibung
  - Zone-Farbe (für farbkodierte Kacheln)
  - Zone-Icon
  - Sort-Order
- ODER: Diese Metadaten als `device_metadata` JSON-Feld auf dem ersten ESP einer Zone speichern (0h Backend, nur Konvention)

**NICHT empfohlen:**
- Vollständige `zones`-Tabelle mit eigenem CRUD-Lifecycle — widerspricht dem bestehenden impliziten Design und erfordert Migration aller bestehenden Zone-Zuweisungen

### Risiko-Einschätzung

| Risiko | Bewertung |
|--------|-----------|
| Backend-BLOCKER für Übersicht-Tab | **KEINER** — alles nötige existiert |
| Umbenennung aller ESPs in einer Zone | **Gering** — Batch-Call möglich (POST assign für jeden ESP) |
| Leere Zone nach letztem ESP-Entfernen | **Design-Entscheidung** — im impliziten System verschwinden leere Zonen |
| Subzone-Verlust bei Zone-Removal | **Gewollt** — Cascade-Delete ist korrekt implementiert |

---

## Quellenverzeichnis

| Datei | Zeilen | Relevanz |
|-------|--------|----------|
| `El Servador/.../db/models/esp.py` | 66-100 | Zone-Felder auf ESP |
| `El Servador/.../db/models/subzone.py` | 1-143 | SubzoneConfig Model |
| `El Servador/.../api/v1/zone.py` | 1-299 | Zone-Endpoints |
| `El Servador/.../api/v1/subzone.py` | 1-417 | Subzone-Endpoints |
| `El Servador/.../services/zone_service.py` | 1-451 | Zone-Business-Logic |
| `El Servador/.../services/subzone_service.py` | 1-581 | Subzone-Business-Logic |
| `El Servador/.../mqtt/handlers/zone_ack_handler.py` | 1-318 | Zone ACK |
| `El Servador/.../mqtt/handlers/subzone_ack_handler.py` | 1-171 | Subzone ACK |
| `El Servador/.../db/repositories/subzone_repo.py` | 1-352 | Subzone-DB-Queries |
| `El Frontend/src/shared/stores/zone.store.ts` | 1-198 | WS-Event-Handler |
| `El Frontend/src/api/zones.ts` | 1-67 | Zone API Client |
| `El Frontend/src/api/subzones.ts` | 1-154 | Subzone API Client |
| `El Frontend/src/composables/useZoneDragDrop.ts` | 120-200 | Zone-Gruppierung |
| `El Frontend/src/components/dashboard/ZonePlate.vue` | 1-756 | Zone-UI-Komponente |
| `El Frontend/src/components/zones/SubzoneArea.vue` | 1-85 | Subzone-UI-Komponente |
| `El Frontend/src/views/HardwareView.vue` | 246-249 | zoneGroups computed |
| `El Servador/.../alembic/versions/add_master_zone_id_to_esp_device.py` | — | Migration |
| `El Servador/.../alembic/versions/add_subzone_configs_table.py` | — | Migration |
