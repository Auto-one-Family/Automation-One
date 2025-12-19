# Vision - UI-Ziele und Roadmap

---

## 📑 Inhaltsverzeichnis

1. [Sidebar-Navigation](#sidebar-navigation)
2. [Dashboard - Zielzustand](#dashboard---zielzustand)
3. [Geräte-Ansicht](#geräte-ansicht---alle-esps)
4. [Sensoren-Ansicht](#sensoren-ansicht)
5. [Aktoren-Ansicht](#aktoren-ansicht)
6. [Relevante Code-Dateien](#relevante-code-dateien)

---

## Sidebar-Navigation

Die Seitenleiste (`AppSidebar.vue`) ist in kollabierbare Gruppen organisiert.

| Gruppe | Tabs | Sichtbarkeit |
|--------|------|--------------|
| Dashboard | Dashboard | Alle |
| Geräte | Alle ESPs, Sensoren, Aktoren | Alle |
| Automation | Regeln | Alle |
| Monitoring | MQTT Live, Server Logs | Alle |
| Administration | Benutzer, Datenbank, System, Last-Tests | Nur Admins |

**Quelle:** `El Frontend/src/components/layout/AppSidebar.vue`

---

## Dashboard - Zielzustand

### Grundprinzipien
- **User-friendly:** Alle Informationen auf einen Blick, ohne technische Überforderung
- **Zielgerichtet:** Klare Handlungsoptionen für den User
- **Konsistent:** Einheitliche Design-Patterns (Iridescent Theme, Glass-Morphism)
- **Responsiv:** Mobile-first, funktioniert auf allen Bildschirmgrößen

---

### 1. Geräte-Übersicht (ESP Cards)

#### Zwei Card-Typen

| Aspekt | Mock-ESP Card | ESP Card (Echte Hardware) |
|--------|---------------|---------------------------|
| **Badge** | `MOCK` (lila) | `REAL` (grün/iridescent) |
| **Herkunft** | Manuell erstellt über UI | Auto-Discovery via MQTT Heartbeat |
| **Zweck** | Entwicklung, Tests, Simulation | Produktivbetrieb |
| **Spezial-Feature** | — | Kann Mock-Voreinstellungen übernehmen |

#### Card-Struktur (Schwebende Satelliten-Cards)

```
                    ┌─────────────┐
                    │  🌡️ Temp    │ ← Sensor-Satellit
                    │    23.4°C   │
                    └──────┬──────┘
                           │
    ┌─────────────┐   ┌────┴────────────────┐   ┌─────────────┐
    │  💧 Moisture│───│                     │───│  💡 Licht   │
    │     67%     │   │   ESP_AB12CD34      │   │    420 lux  │
    └─────────────┘   │   ───────────────   │   └─────────────┘
                      │   Zone: Gewächshaus │
         ┌───────────│   Status: ● Online  │───────────┐
         │            │   Sensoren: 4       │           │
         │            │   Aktoren: 2        │           │
         │            └────────────────────┘           │
         │                     │                        │
    ┌────┴────────┐      ┌─────┴─────┐           ┌─────┴─────┐
    │  🔴 Pumpe   │      │  🟢 Ventil│           │  ⚡ Relais │
    │   [AN]      │      │   [AUS]   │           │   [AUS]    │
    └─────────────┘      └───────────┘           └────────────┘
                              ↑
                         Aktor-Satelliten
```

**Verhalten:**
- Satelliten-Cards schweben um die Haupt-ESP-Card
- Zeigen Live-Werte der Sensoren und Status der Aktoren
- **Klick auf Satellit:** Zeigt Verbindungslinien zu allen logisch verknüpften Sensoren/Aktoren
  - Grüne Linien = aktive Logik-Verbindung
  - Gestrichelte Linien = interne ESP-Verbindungen
  - Durchgezogene Linien = Cross-ESP-Verbindungen

---

### 2. Zonen-Management (Drag & Drop)

#### Zone-Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  ZONEN-ÜBERSICHT                                           [+ Zone] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────┐│
│  │ 🏠 Gewächshaus      │  │ 🌱 Anzuchtbereich   │  │ ❓ Ohne Zone ││
│  │ ─────────────────── │  │ ─────────────────── │  │ ──────────── ││
│  │                     │  │                     │  │              ││
│  │  [ESP_A1]  [ESP_A2] │  │  [ESP_B1]          │  │  [ESP_NEW]   ││
│  │                     │  │                     │  │    ↑         ││
│  │  [MOCK_01]          │  │  [MOCK_02]          │  │  Neu!        ││
│  │                     │  │                     │  │  Einrichten→ ││
│  └─────────────────────┘  └─────────────────────┘  └──────────────┘│
│                                                                     │
│  [────────────────── DRAG & DROP ZONE ──────────────────]          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Funktionen:**
- **Drag & Drop:** ESPs zwischen Zonen verschieben
- **Neue ESPs ohne Zone:** Werden im Bereich "Ohne Zone" angezeigt
  - Auffällig markiert (pulsierender Rand)
  - Quick-Setup Button für sofortige Einrichtung
- **Mock → ESP Transfer:** Beim Einrichten eines echten ESPs können Mock-Voreinstellungen übernommen werden:
  - Sensor-Konfigurationen
  - Aktor-Konfigurationen  
  - Zone-Zuweisungen
  - Logik-Regeln (nach Funktionstest)

---

### 3. Verlinkungen (Sanfte Übergänge)

**Problem (Aktuell):** Klick auf ESP → Direkter Sprung zur Detailseite wirkt abrupt.

**Lösung:**
1. **Hover-Preview:** Bei Hover auf ESP-Card erscheint kleines Popup mit Kurzinfo
2. **Expand-Animation:** Card expandiert sanft zur Vollansicht (innerhalb Dashboard)
3. **Breadcrumb:** Klarer Pfad zurück: `Dashboard > ESP_AB12CD34`
4. **Slide-Transition:** Seiten-Übergang mit horizontaler Slide-Animation

---

### 4. Statistik-Karten (Bestehend, erweitert)

| Karte | Wert | Subtitle |
|-------|------|----------|
| ESP-Geräte | Gesamt (Mock + Real) | X online |
| Sensoren | Anzahl aktiver Sensoren | "Aktive Messungen" |
| Aktoren | Anzahl Aktoren | X eingeschaltet |
| Automation | Anzahl aktiver Regeln | "Aktive Regeln" |
| Zonen | Anzahl Zonen | X ESPs zugewiesen |

---

## Geräte-Ansicht - Alle ESPs

**Route:** `/devices` (aktuell `/mock-esp`, umbenennen zu `/devices`)

### Ziel: Unified Device View

Mock-ESPs und echte ESPs werden in **einer** Ansicht kombiniert angezeigt.

### Filter-Optionen

| Filter | Optionen |
|--------|----------|
| Typ | Alle, Mock, Real |
| Status | Online, Offline, Error, Safe-Mode |
| Zone | Alle Zonen, Ohne Zone |
| Hardware | ESP32_WROOM, XIAO_ESP32_C3, MOCK_* |

### Detailansicht (ESP-Detail)

**Route:** `/devices/{esp_id}`

#### Verfügbare Aktionen

| Aktion | Beschreibung | API |
|--------|--------------|-----|
| **Löschen** | ESP aus System entfernen | `DELETE /debug/mock-esp/{id}` (Mock) oder `DELETE /v1/esp/devices/{id}` (Real) |
| **Config ändern** | Hardware-Einstellungen | `POST /v1/esp/devices/{id}/config` |
| **Heartbeat triggern** | Manueller Heartbeat | `POST /debug/mock-esp/{id}/heartbeat` |
| **Restart** | ESP neustarten | `POST /v1/esp/devices/{id}/restart` |
| **Factory Reset** | Auf Werkseinstellungen | `POST /v1/esp/devices/{id}/reset` |
| **Zone ändern** | Zone zuweisen/entfernen | `PATCH /v1/esp/devices/{id}` |

#### Sensor-Management

| Aktion | Beschreibung |
|--------|--------------|
| **Sensor hinzufügen** | GPIO-Pin + Sensor-Typ auswählen |
| **Sensor konfigurieren** | Kalibrierung, Intervalle, Thresholds |
| **Sensor entfernen** | Sensor von ESP entfernen |
| **Live-Werte** | Echtzeit-Anzeige der Messwerte |

#### Aktor-Management

| Aktion | Beschreibung |
|--------|--------------|
| **Aktor hinzufügen** | GPIO-Pin + Aktor-Typ auswählen |
| **Aktor konfigurieren** | Min/Max-Werte, Timeout, Safety |
| **Aktor steuern** | AN/AUS, PWM-Wert setzen |
| **Emergency Stop** | Notfall-Stopp (einzeln oder alle) |

#### Subzone-Management

| Aktion | Beschreibung |
|--------|--------------|
| **Subzone erstellen** | Logische Untergruppe innerhalb ESP |
| **GPIOs zuweisen** | Sensoren/Aktoren zu Subzone |
| **Safe-Mode** | Subzone in sicheren Zustand versetzen |

---

## Sensoren-Ansicht

**Route:** `/sensors`

### Sensor-Libraries (Server-Side Processing)

AutomationOne verwendet **Pi-Enhanced Mode**: ESPs senden Rohdaten, der Server verarbeitet sie mit Sensor-Libraries.

#### Verfügbare Libraries

| Library | Datei | Beschreibung |
|---------|-------|--------------|
| **Temperature** | `temperature.py` | Temperatur-Sensoren (DS18B20, DHT22, etc.) |
| **Humidity** | `humidity.py` | Luftfeuchtigkeit |
| **pH** | `ph_sensor.py` | pH-Wert-Messung mit Kalibrierung |
| **EC** | `ec_sensor.py` | Elektrische Leitfähigkeit |
| **Moisture** | `moisture.py` | Bodenfeuchtigkeit |
| **Light** | `light.py` | Lichtstärke (Lux) |
| **Pressure** | `pressure.py` | Druck-Sensoren |
| **Flow** | `flow.py` | Durchfluss-Sensoren |
| **CO2** | `co2.py` | CO2-Konzentration |

**Speicherort:** `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/`

#### Custom Libraries (Geplant)

```
┌─────────────────────────────────────────────────────────────┐
│  🧪 CUSTOM SENSOR LIBRARY                          [Beta]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Name:        [__________________________]                  │
│                                                             │
│  Basis:       [Rohwert → Verarbeitung → Kalibrierter Wert] │
│                                                             │
│  Formel:      [calibrated = raw * factor + offset]         │
│                                                             │
│  Einheit:     [__________]   Dezimalstellen: [2]           │
│                                                             │
│  Min/Max:     [0.0] - [100.0]                              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  def process(raw_value, calibration):               │   │
│  │      factor = calibration.get('factor', 1.0)        │   │
│  │      offset = calibration.get('offset', 0.0)        │   │
│  │      return raw_value * factor + offset             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Testen]  [Speichern]  [Abbrechen]                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Status:** 🔴 Noch nicht implementiert - Geplant für Phase 7

### Sensor-Übersicht

| Spalte | Beschreibung |
|--------|--------------|
| ESP | Zugehöriger ESP (mit Link) |
| GPIO | Pin-Nummer |
| Typ | Sensor-Typ (temperature, ph, etc.) |
| Aktueller Wert | Live-Wert mit Einheit |
| Qualität | Signal-Qualität (good, degraded, poor) |
| Letztes Update | Zeitstempel |
| Aktionen | Details, Kalibrieren, Entfernen |

---

## Aktoren-Ansicht

**Route:** `/actuators`

### Aktor-Typen

| Typ | Server-Typ | Beschreibung | Wertbereich |
|-----|------------|--------------|-------------|
| **Pumpe** | `digital` | Ein/Aus-Steuerung | 0.0 / 1.0 |
| **Ventil** | `digital` | Ein/Aus-Steuerung | 0.0 / 1.0 |
| **Relais** | `digital` | Ein/Aus-Steuerung | 0.0 / 1.0 |
| **PWM** | `pwm` | Stufenlose Regelung | 0.0 - 1.0 |
| **Servo** | `servo` | Positionssteuerung | 0.0 - 1.0 |

**Mapping ESP32 → Server:**
- `pump` → `digital`
- `valve` → `digital`
- `relay` → `digital`
- `pwm` → `pwm`
- `servo` → `servo`

### Aktor-Libraries (Geplant)

Analog zu Sensor-Libraries: Custom Aktor-Verhalten definieren.

**Status:** 🔴 Noch nicht implementiert - Geplant für Phase 7

### Aktor-Übersicht

| Spalte | Beschreibung |
|--------|--------------|
| ESP | Zugehöriger ESP (mit Link) |
| GPIO | Pin-Nummer |
| Typ | Aktor-Typ |
| Status | AN/AUS/PWM-Wert |
| Zustand | idle, active, error, emergency_stop |
| Laufzeit | Aktuelle Laufzeit |
| Aktionen | Steuern, Details, Emergency Stop |

### Sicherheits-Features

| Feature | Beschreibung |
|---------|--------------|
| **Timeout** | Auto-Abschaltung nach X Sekunden |
| **Min/Max-Werte** | Begrenzte Wertbereiche |
| **Cooldown** | Pause zwischen Aktivierungen |
| **Emergency Stop** | Sofortige Abschaltung aller Aktoren |

---

## Relevante Code-Dateien

### Frontend

| Datei | Beschreibung |
|-------|--------------|
| `src/views/DashboardView.vue` | Dashboard-Hauptansicht |
| `src/views/MockEspView.vue` | ESP-Listenansicht (→ umbenennen zu DevicesView) |
| `src/views/MockEspDetailView.vue` | ESP-Detailansicht |
| `src/views/SensorsView.vue` | Sensoren-Übersicht |
| `src/views/ActuatorsView.vue` | Aktoren-Übersicht |
| `src/components/layout/AppSidebar.vue` | Sidebar-Navigation |
| `src/components/dashboard/StatCard.vue` | Statistik-Karten |
| `src/components/common/ESPCard.vue` | ESP-Card-Komponente |
| `src/components/common/Badge.vue` | Status-Badges |
| `src/components/debug/ZoneAssignmentPanel.vue` | Zonen-Zuweisung |
| `src/stores/mockEsp.ts` | Mock-ESP State Management |
| `src/api/debug.ts` | Debug/Mock-ESP API Client |
| `src/router/index.ts` | Router-Konfiguration |

### Backend - ESP Management

| Datei | Beschreibung |
|-------|--------------|
| `src/api/v1/esp.py` | ESP Device API Endpoints |
| `src/api/v1/debug.py` | Mock-ESP Debug Endpoints |
| `src/services/esp_service.py` | ESP Business Logic |
| `src/db/models/esp.py` | ESPDevice Model |
| `src/db/repositories/esp_repo.py` | ESP Repository |
| `src/mqtt/handlers/heartbeat_handler.py` | Auto-Discovery via Heartbeat |
| `src/mqtt/handlers/discovery_handler.py` | Legacy Discovery (deprecated) |

### Backend - Sensoren

| Datei | Beschreibung |
|-------|--------------|
| `src/api/v1/sensors.py` | Sensor API Endpoints |
| `src/db/models/sensor.py` | SensorConfig, SensorData Models |
| `src/db/repositories/sensor_repo.py` | Sensor Repository |
| `src/sensors/library_loader.py` | Dynamischer Library Loader |
| `src/sensors/base_processor.py` | Basis-Klasse für Sensor-Prozessoren |
| `src/sensors/sensor_libraries/active/*.py` | Sensor-Libraries |

### Backend - Aktoren

| Datei | Beschreibung |
|-------|--------------|
| `src/api/v1/actuators.py` | Actuator API Endpoints |
| `src/db/models/actuator.py` | ActuatorConfig, ActuatorState, ActuatorHistory |
| `src/db/repositories/actuator_repo.py` | Actuator Repository |
| `src/services/actuator_service.py` | Actuator Business Logic |
| `src/mqtt/handlers/actuator_handler.py` | MQTT Actuator Handler |
| `src/schemas/actuator.py` | Actuator Pydantic Schemas |

### Backend - Zonen & Subzones

| Datei | Beschreibung |
|-------|--------------|
| `src/api/v1/subzone.py` | Subzone API Endpoints |
| `src/db/models/subzone.py` | SubzoneConfig Model |
| `src/db/repositories/subzone_repo.py` | Subzone Repository |
| `src/services/subzone_service.py` | Subzone Business Logic |

---

## API-Übersicht

### Mock-ESP APIs (Debug)

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/debug/mock-esp` | Liste aller Mock-ESPs |
| POST | `/debug/mock-esp` | Mock-ESP erstellen |
| GET | `/debug/mock-esp/{id}` | Mock-ESP Details |
| DELETE | `/debug/mock-esp/{id}` | Mock-ESP löschen |
| POST | `/debug/mock-esp/{id}/heartbeat` | Heartbeat triggern |
| POST | `/debug/mock-esp/{id}/state` | System-State setzen |
| POST | `/debug/mock-esp/{id}/sensors` | Sensor hinzufügen |
| POST | `/debug/mock-esp/{id}/actuators` | Aktor hinzufügen |
| POST | `/debug/mock-esp/emergency-stop` | Globaler Emergency Stop |

### Echte ESP APIs

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/v1/esp/devices` | Liste aller ESPs |
| POST | `/v1/esp/devices` | ESP manuell registrieren |
| GET | `/v1/esp/devices/{id}` | ESP Details |
| PATCH | `/v1/esp/devices/{id}` | ESP aktualisieren |
| POST | `/v1/esp/devices/{id}/config` | Config via MQTT senden |
| POST | `/v1/esp/devices/{id}/restart` | Restart-Befehl |
| POST | `/v1/esp/devices/{id}/reset` | Factory Reset |
| GET | `/v1/esp/devices/{id}/health` | Health Metrics |
| GET | `/v1/esp/discovery` | Network Discovery |

---

## Implementierungs-Priorität

| Priorität | Feature | Status |
|-----------|---------|--------|
| 🔴 HOCH | Unified Device View (Mock + Real) | 📋 Geplant |
| 🔴 HOCH | Zonen-Drag & Drop | 📋 Geplant |
| 🔴 HOCH | Satelliten-Cards mit Live-Werten | 📋 Geplant |
| 🟡 MITTEL | Logik-Verbindungslinien | 📋 Geplant |
| 🟡 MITTEL | Mock → ESP Config-Transfer | 📋 Geplant |
| 🟡 MITTEL | Sanfte Seiten-Übergänge | 📋 Geplant |
| 🟢 NIEDRIG | Custom Sensor Libraries | 📋 Geplant (Phase 7) |
| 🟢 NIEDRIG | Custom Actuator Libraries | 📋 Geplant (Phase 7) |

---

*Letzte Aktualisierung: Dezember 2024*
