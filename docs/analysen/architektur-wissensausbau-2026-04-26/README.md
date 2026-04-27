# Architektur-Wissensausbau AutomationOne — 2026-04-26

> **Master-Issue:** [AUT-175](https://linear.app/autoone/issue/AUT-175/auftragstypwissens-ausbau-architektur-wissensausbau-master-sprint)
> **Status:** E11 (Konsolidierung) Done — Sprint abgeschlossen 2026-04-26
> **Sprache:** Deutsch (Code-Bezeichner, Dateinamen und englische Technologienamen bleiben englisch)
> **Keine Code-Änderungen** — reiner Analyse- und Dokumentationsauftrag

## Zweck

Verlinkte, intern konsistente Architektur-Wissensbasis für das gesamte AutomationOne-System.
Alle 3 Schichten (ESP32, Server, Frontend) und alle Querschnittsthemen werden erklärt.
Bekannte Inkonsistenzen werden **inline** an der inhaltlich richtigen Stelle kommentiert — nicht in einer Sammeldatei.

---

## Inkonsistenz-Konvention (verbindlich für alle Etappen)

### Bekannte Inkonsistenz (Code-verifiziert)

```
> [!INKONSISTENZ] Kurze Beschreibung
>
> **Beobachtung:** Was widerspricht sich konkret
> **Korrekte Stelle:** [Abschnitt X.Y in doc.md](relativer-pfad#anchor)
> **Empfehlung:** Was wäre konsistent — ohne hier zu fixen
> **Erst-Erkennung:** Etappe + Datum
```

### Ungesicherte Annahme (nicht code-verifiziert)

```
> [!ANNAHME] Kurze Beschreibung
>
> **Basis:** Woher die Annahme stammt
> **Zu verifizieren:** Was der Spezialagent prüfen soll
```

---

## Etappen-Reihenfolge (bindend)

```
E0 (Reality-Check)
  └─► E1 (Gesamtüberblick)
        ├─► E2 (Firmware)       ┐
        ├─► E3 (Server)         │ parallel
        ├─► E4 (Frontend)       │
        ├─► E5 (MQTT)           │
        ├─► E6 (Datenbank)      │
        ├─► E7 (Auth)           │
        ├─► E8 (Background)     │
        ├─► E9 (Observability)  │
        └─► E10 (Löschpfade)    ┘
              └─► E11 (Konsolidierung + Inkonsistenz-Index)
```

---

## Etappen-Übersicht

| # | Etappe | Zuständig | Status | Dokument |
|---|--------|-----------|--------|----------|
| E0 | Reality-Check + Sprint-Planung | TM | **Done** | [E0-reality-check.md](00-uebersicht/E0-reality-check.md) |
| E1 | Architektur-Gesamtüberblick | TM | **Done** | [E1-architektur-gesamtueberblick.md](00-uebersicht/E1-architektur-gesamtueberblick.md) |
| E2 | Firmware-Schicht | Firmware-Agent (esp32-dev) | **In Progress** | [E2-firmware-schicht.md](10-firmware/E2-firmware-schicht.md) |
| E3 | Server-Schicht | Backend-Agent (server-dev) | **In Progress** | [E3-server-schicht.md](20-server/E3-server-schicht.md) |
| E4 | Frontend-Schicht | Frontend-Agent (frontend-dev) | **In Progress** | [E4-frontend-schicht.md](30-frontend/E4-frontend-schicht.md) |
| E5 | MQTT-Topic-Matrix + Datenfluss-Karte | TM koordiniert (mqtt-dev) | **In Progress** | [E5-mqtt-topic-matrix.md](40-querschnitt-mqtt/E5-mqtt-topic-matrix.md) |
| E6 | Datenbank-Schema + Migrations-Historie | Backend-Agent (server-dev) | **In Progress** | [E6-datenbank-schema.md](50-querschnitt-db/E6-datenbank-schema.md) |
| E7 | Auth + Security + ACL | Backend-Agent (server-dev) | **In Progress** | [E7-auth-security-acl.md](60-querschnitt-auth/E7-auth-security-acl.md) |
| E8 | Background-Services + Scheduler | Backend-Agent (server-dev) | **In Progress** | [E8-background-services.md](70-querschnitt-hintergrund/E8-background-services.md) |
| E9 | Observability + Tests + CI/CD | meta-analyst + system-control | **In Progress** | [E9-observability-tests-cicd.md](70-querschnitt-hintergrund/E9-observability-tests-cicd.md) |
| E10 | Löschpfade + Restore + Audit-Logs | Backend + Frontend Agent | **In Progress** | [E10-loeschpfade.md](80-querschnitt-loeschpfade/E10-loeschpfade.md) |
| E11 | Konsolidierung + Inkonsistenz-Index | TM | **Done** | [E11-inkonsistenz-index.md](99-konsolidierung/E11-inkonsistenz-index.md) |

---

## Verzeichnisstruktur

```
architektur-wissensausbau-2026-04-26/
├── README.md                                    ← diese Datei (Index)
├── 00-uebersicht/
│   ├── E0-reality-check.md                      ← TM (Done)
│   └── E1-architektur-gesamtueberblick.md       ← TM (In Progress)
├── 10-firmware/
│   └── E2-firmware-schicht.md                   ← Firmware-Agent
├── 20-server/
│   └── E3-server-schicht.md                     ← Backend-Agent
├── 30-frontend/
│   └── E4-frontend-schicht.md                   ← Frontend-Agent
├── 40-querschnitt-mqtt/
│   └── E5-mqtt-topic-matrix.md                  ← TM/mqtt-dev
├── 50-querschnitt-db/
│   └── E6-datenbank-schema.md                   ← Backend-Agent
├── 60-querschnitt-auth/
│   └── E7-auth-security-acl.md                  ← Backend-Agent
├── 70-querschnitt-hintergrund/
│   ├── E8-background-services.md                ← Backend-Agent
│   └── E9-observability-tests-cicd.md           ← meta-analyst
├── 80-querschnitt-loeschpfade/
│   └── E10-loeschpfade.md                       ← Backend + Frontend Agent
└── 99-konsolidierung/
    └── E11-inkonsistenz-index.md                ← TM
```

---

## Bekannte Inkonsistenzen aus AUT-175 (Tracking-Liste)

*E0-verifiziert. E11 verlinkt mit Ankern.*

| # | Beschreibung | E0-Befund | Etappe |
|---|-------------|-----------|--------|
| I1 | `i2c_address` fehlt im NVS-Schema (`sen_{i}_i2c`) | **Widerlegt** — `NVS_SEN_I2C "sen_%d_i2c"` existiert und wird geschrieben | E2 |
| I2 | `actuator_type` Mismatch: Config="digital" vs. States="relay" | **Bestätigt** — Server normalisiert relay→digital, Frontend zeigt beides | E2/E4 |
| I3 | Tabellen-Namens-Drift: users→user_accounts, heartbeat_logs→esp_heartbeat_logs | **Bestätigt** — DB-Modelle heißen `UserAccount`, `ESPHeartbeatLog` | E3/E6 |
| I4 | `--ao-*` Token-Prefix existiert nicht (semantische Prefixes stattdessen) | **Bestätigt** — CSS-Tokens nutzen semantische Namen, kein `--ao-*` | E4 |
| I5 | VIRTUAL-Filter: 6 Callpoints, nur 1 Filter → Risiko bei neuem Callpoint | **Bestätigt** (8 Callpoints, nicht 6) — Filter nur in `build_combined_config()` | E3 |
| I6 | Soft-Delete nur esp_devices + zones; alle anderen cascade-deleted | **Bestätigt** — `zones` hat `deleted_at`, alle anderen hard-deleted | E6 |
| I7 | Heartbeat-Mismatch erkennt nur Totalverlust (esp_count==0 AND db_count>0) | **Widerlegt** — AUT-134-Fix: erkennt jeden Drift (`esp_count != db_count`) | E3 |
| I8 | `clean_session=true` in Firmware → QoS-2 Messages bei Disconnect verloren | **Bestätigt** — `mqtt_cfg.disable_clean_session = 0` (aktiv) | E2/E5 |
| I9 | SHT31: KEIN Adafruit-Layer, direktes I2C-Protokoll (Command 0x2400) | **Bestätigt** — `SHT31Sensor.cpp` schreibt 0x24, 0x00 direkt | E2 |
| I10 | `sensor_type_registry.py` unter `src/sensors/`, nicht `src/services/` | **Bestätigt** — Pfad: `src/sensors/sensor_type_registry.py` | E3 |
| I11 | KaiserHandler ist Stub (13. MQTT-Handler, nur 12 aktiv) | **Widerlegt** — KaiserHandler vollständig implementiert (sync, cmd routing) | E3 |
| I12 | 22% Debug-Endpoints alle hinter AdminUser — kein Monitoring ob aktiv | **Widerlegt** — Debug-Endpoints sind hinter Auth-Guard, das ist korrekt | E7 |
| I13 | sensorId `espId:gpio:sensorType` — Matching-Fehler bei Multi-Sensor auf gleichem GPIO | **Teilweise** — Format komplex, MEMORY NB6 dokumentiert DS18B20-Overwrite-Bug | E4 |
| I14 | `sensor_data` Metadata: nur `{"raw_mode": true}` — i2c_address/onewire_address fehlen | **Widerlegt** — `i2c_address` wird conditional gespeichert (`if i2c_address`) | E3/E4 |
| E1 | WebSocket EventType union zu eng (31 Event-Typen, nur ~16 im TypeScript-Union) | **Neu (E0)** | E4 |
| E2 | `zones` table: Soft-Delete (`deleted_at`) vorhanden, aber kein Cascade für verwaiste Subzones | **Neu (E0)** | E6 |
| E3 | `notification_logs` fehlt `device_id`-Spalte (nur `esp_uuid` als String, kein FK) | **Neu (E0)** | E6/E8 |
| E4 | Alembic hat 4 Merge-Points (Parallelentwicklung ohne Rebase-Linearisierung) | **Neu (E0)** | E6 |
| E5 | `CentralScheduler` (MaintenanceService) ist Singleton ohne Health-Endpoint | **Neu (E0)** | E8/E9 |
