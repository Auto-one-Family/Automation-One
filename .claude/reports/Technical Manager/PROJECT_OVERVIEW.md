# AutomationOne - Projekt-Einarbeitung

> **Zielgruppe:** Neuer Technical Manager / KI-Agent
> **Erstellt:** 2026-02-05
> **Version:** 1.0

---

## Was ist AutomationOne?

AutomationOne ist ein **IoT-Framework für Gewächshausautomation** auf industriellem Niveau. Das System steuert Sensoren (Temperatur, Luftfeuchtigkeit, Bodenfeuchtigkeit etc.) und Aktoren (Pumpen, Lüfter, Beleuchtung) in Gewächshäusern.

### Das Kernprinzip: Server-Zentrische Architektur

```
┌─────────────────────────────────────────────────────────────┐
│              EL FRONTEND (Vue 3 Dashboard)                  │
│         Visualisierung, Konfiguration, Monitoring           │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP REST + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│            EL SERVADOR (God-Kaiser Server)                  │
│      ALLE INTELLIGENZ: Verarbeitung, Logic, Automation      │
│           FastAPI + PostgreSQL + MQTT-Broker                │
└──────────────────────────┬──────────────────────────────────┘
                           │ MQTT (verschlüsselt)
┌──────────────────────────▼──────────────────────────────────┐
│           EL TRABAJANTE (ESP32 Firmware)                    │
│      DUMME AGENTEN: Nur Rohdaten senden, Befehle folgen     │
└─────────────────────────────────────────────────────────────┘
```

**Wichtigste Regel:** ESP32 = "dumme Agenten". Sie sammeln nur Rohdaten und führen Befehle aus. **ALLE** Logik, Verarbeitung und Entscheidungen passieren auf dem Server.

---

## Die Drei Komponenten

### 1. El Frontend (Vue 3 Dashboard)

**Pfad:** `El Frontend/`
**Technologie:** Vue 3, TypeScript, Pinia, Tailwind CSS, Vite

**Was es macht:**
- Web-Dashboard für Benutzer
- Echtzeit-Anzeige von Sensordaten
- Steuerung von Aktoren
- Zone-Management (Räume, Bereiche)
- Logic-Editor für Automationsregeln
- System-Monitor (Logs, Events, MQTT-Traffic)

**Wichtige Ordner:**
| Ordner | Inhalt |
|--------|--------|
| `src/views/` | Seiten (Dashboard, Sensoren, Aktoren, Logic) |
| `src/components/` | Wiederverwendbare UI-Komponenten |
| `src/stores/` | Pinia State Management |
| `src/services/` | API-Client, WebSocket |
| `src/composables/` | Vue Hooks (useWebSocket, useToast) |

**Starten:** `cd "El Frontend" && npm run dev`

---

### 2. El Servador (God-Kaiser Server)

**Pfad:** `El Servador/god_kaiser_server/`
**Technologie:** Python 3.11+, FastAPI, PostgreSQL, MQTT (paho-mqtt)

**Was es macht:**
- REST API für Frontend
- WebSocket für Echtzeit-Events
- MQTT-Kommunikation mit ESP32
- Sensor-Datenverarbeitung und Speicherung
- Actuator-Befehlsvalidierung und -versand
- Cross-ESP Automationslogik (Logic Engine)
- Benutzer-Authentifizierung (JWT)
- Audit-Logging

**Wichtige Ordner:**
| Ordner | Inhalt |
|--------|--------|
| `src/api/v1/` | REST-Endpoints (sensors, actuators, esp, logic) |
| `src/mqtt/handlers/` | MQTT-Message-Handler |
| `src/services/` | Business Logic (sensor_service, logic_engine) |
| `src/db/models/` | SQLAlchemy Database Models |
| `src/db/repositories/` | Data Access Layer |
| `alembic/` | Database Migrations |

**Starten:** `cd "El Servador/god_kaiser_server" && poetry run uvicorn src.main:app --reload`

---

### 3. El Trabajante (ESP32 Firmware)

**Pfad:** `El Trabajante/`
**Technologie:** C++, Arduino Framework, PlatformIO

**Was es macht:**
- Sensoren auslesen (I2C, OneWire)
- Rohdaten per MQTT senden
- Actuator-Befehle vom Server empfangen und ausführen
- WiFi-Verbindung und Provisioning (AP-Mode)
- Heartbeat an Server senden
- NVS-Storage für Konfiguration

**Wichtige Ordner:**
| Ordner | Inhalt |
|--------|--------|
| `src/services/` | Manager (sensor, actuator, mqtt, wifi) |
| `src/drivers/` | Hardware-Treiber (gpio, i2c, onewire, pwm) |
| `src/config/` | System- und Hardware-Konfiguration |
| `src/error_handling/` | Error Tracker, Health Monitor |

**Build:** `pio run -e seeed_xiao_esp32c3`
**Flash:** `pio run -e seeed_xiao_esp32c3 -t upload`

---

## Kommunikation

### Frontend <-> Server: HTTP/REST + WebSocket

```
Frontend                          Server
   │                                │
   │──── GET /api/v1/sensors ──────>│  REST: Daten abrufen
   │<─── JSON Response ─────────────│
   │                                │
   │<═══ WebSocket: sensor_data ════│  Echtzeit: Live-Updates
   │<═══ WebSocket: esp_health ═════│
```

### Server <-> ESP32: MQTT

```
ESP32                             Server
  │                                 │
  │─── ao/{esp_id}/sensors ────────>│  Sensordaten senden
  │─── ao/{esp_id}/heartbeat ──────>│  Lebenszeichen
  │                                 │
  │<── ao/{esp_id}/actuators/cmd ───│  Befehle empfangen
  │<── ao/{esp_id}/config ──────────│  Konfiguration
```

**Topic-Schema:** `ao/{esp_id}/{resource}/{action}`

---

## KI-Agenten-Struktur (.claude/)

Das Projekt nutzt Claude Code mit einer spezialisierten Agenten-Struktur:

### Skills (Entwicklungs-Guides)

| Skill | Zweck | Pfad |
|-------|-------|------|
| `esp32-development` | ESP32 Firmware entwickeln | `.claude/skills/esp32-development/` |
| `server-development` | Server-Code entwickeln | `.claude/skills/server-development/` |
| `frontend-development` | Vue Dashboard entwickeln | `.claude/skills/frontend-development/` |
| `System Manager` | Session-Orchestration | `.claude/skills/System Manager/` |

### Dev-Agenten (Pattern-konforme Implementierung)

| Agent | Aufgabe |
|-------|---------|
| `esp32-dev` | ESP32-Code implementieren nach bestehenden Patterns |
| `server-dev` | Server-Code implementieren nach bestehenden Patterns |
| `mqtt-dev` | MQTT Topics/Handler auf beiden Seiten implementieren |

### Debug-Agenten (Problemanalyse)

| Agent | Aufgabe |
|-------|---------|
| `esp32-debug` | Serial-Logs analysieren, Boot-Probleme |
| `server-debug` | Server-Logs analysieren, Error 5xxx |
| `mqtt-debug` | MQTT-Traffic analysieren |
| `meta-analyst` | Cross-Report-Vergleich, Widersprüche finden |
| `db-inspector` | Datenbank inspizieren |
| `system-control` | System starten/stoppen/builden |

### Session-Orchestrator

| Agent | Aufgabe |
|-------|---------|
| `system-manager` | Session-Briefings erstellen (Plan Mode) |

---

## Wichtige Regeln

### 1. Server-Zentrisch (UNVERÄNDERLICH)
- **NIEMALS** Business-Logic auf ESP32
- **NIEMALS** Entscheidungslogik auf ESP32
- ESP32 ist absichtlich "dumm"

### 2. Patterns erweitern, nicht neu bauen
- Vor Implementierung: bestehende Patterns finden
- Code analysieren mit grep/find
- Bestehende Lösungen erweitern

### 3. Namenskonventionen
| Komponente | Stil | Beispiel |
|------------|------|----------|
| ESP32 C++ | snake_case | `sensor_manager` |
| Python | snake_case | `sensor_service` |
| Vue/TS | camelCase | `sensorData` |
| Types | PascalCase | `SensorConfig` |

### 4. Vor Abschluss verifizieren
- ESP32: `pio run` (Build erfolgreich)
- Server: `pytest` (Tests grün)
- Frontend: `npm run build` (Build erfolgreich)

---

## Typischer Workflow

```
1. SKILL LESEN
   └─ Relevanten Skill aus .claude/skills/ lesen

2. CODEBASE ANALYSIEREN
   └─ Bestehende Patterns finden
   └─ Betroffene Dateien identifizieren

3. PLANEN
   └─ Lösung auf Basis bestehender Patterns
   └─ Cross-Component Impact prüfen

4. IMPLEMENTIEREN
   └─ Pattern erweitern
   └─ Fehlerbehandlung einbauen

5. VERIFIZIEREN
   └─ Tests ausführen
   └─ Build prüfen
```

---

## Wichtige Referenzen

| Dokument | Pfad | Inhalt |
|----------|------|--------|
| Router | `.claude/CLAUDE.md` | Skill/Agent Routing |
| Regeln | `.claude/rules/rules.md` | Entwicklungsregeln |
| MQTT Topics | `.claude/reference/api/MQTT_TOPICS.md` | Topic-Schema |
| Error Codes | `.claude/reference/errors/ERROR_CODES.md` | Fehlercodes |
| Comm Flows | `.claude/reference/patterns/COMMUNICATION_FLOWS.md` | Datenflüsse |

---

## Quick Reference: Befehle

### Server
```bash
# Starten
cd "El Servador/god_kaiser_server"
poetry run uvicorn src.main:app --reload --port 8000

# Tests
poetry run pytest tests/ -v

# Migrations
poetry run alembic upgrade head
```

### ESP32
```bash
# Build
pio run -e seeed_xiao_esp32c3

# Flash
pio run -e seeed_xiao_esp32c3 -t upload

# Monitor
pio device monitor
```

### Frontend
```bash
# Dev Server
cd "El Frontend"
npm run dev

# Build
npm run build
```

---

## Zusammenfassung

AutomationOne ist ein **produktionsreifes IoT-Framework** mit:
- **Klarer Architektur:** Server = Gehirn, ESP32 = Hände
- **Drei Komponenten:** Frontend (Vue), Server (FastAPI), Firmware (ESP32)
- **MQTT-Kommunikation:** Zwischen Server und ESP32
- **Umfangreicher KI-Dokumentation:** Skills, Agents, References

Die wichtigste Regel: **Server-Zentrisch**. Alle Intelligenz auf dem Server, niemals auf ESP32.

---

*Dieses Dokument dient als Einstieg. Für Details siehe die verlinkten Skill-Dokumente und Reference-Dateien.*
