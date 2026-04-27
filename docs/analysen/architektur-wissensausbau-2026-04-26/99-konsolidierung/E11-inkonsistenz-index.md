# E11 — Konsolidierung und Inkonsistenz-Index

> **Linear:** [AUT-187](https://linear.app/autoone/issue/AUT-187)
> **Status:** Done — 2026-04-26
> **Zuständig:** TM (Technical Manager)
> **Basis:** E0–E1 code-verifiziert; E2–E10 Agenten-Befunde werden integriert

---

## 1. Sprint-Zusammenfassung

| Etappe | Dokument | Status | Linear |
|---|---|---|---|
| E0 Reality-Check | [E0-reality-check.md](../00-uebersicht/E0-reality-check.md) | Done | [AUT-176](https://linear.app/autoone/issue/AUT-176) |
| E1 Gesamtüberblick | [E1-architektur-gesamtueberblick.md](../00-uebersicht/E1-architektur-gesamtueberblick.md) | Done | [AUT-177](https://linear.app/autoone/issue/AUT-177) |
| E2 Firmware | [E2-firmware-schicht.md](../10-firmware/E2-firmware-schicht.md) | Done | [AUT-178](https://linear.app/autoone/issue/AUT-178) |
| E3 Server | [E3-server-schicht.md](../20-server/E3-server-schicht.md) | Done | [AUT-179](https://linear.app/autoone/issue/AUT-179) |
| E4 Frontend | [E4-frontend-schicht.md](../30-frontend/E4-frontend-schicht.md) | Done | [AUT-180](https://linear.app/autoone/issue/AUT-180) |
| E5 MQTT | [E5-mqtt-topic-matrix.md](../40-querschnitt-mqtt/E5-mqtt-topic-matrix.md) | Done | [AUT-181](https://linear.app/autoone/issue/AUT-181) |
| E6 Datenbank | [E6-datenbank-schema.md](../50-querschnitt-db/E6-datenbank-schema.md) | Done | [AUT-182](https://linear.app/autoone/issue/AUT-182) |
| E7 Auth | [E7-auth-security-acl.md](../60-querschnitt-auth/E7-auth-security-acl.md) | Done | [AUT-183](https://linear.app/autoone/issue/AUT-183) |
| E8 Background | [E8-background-services.md](../70-querschnitt-hintergrund/E8-background-services.md) | Done | [AUT-184](https://linear.app/autoone/issue/AUT-184) |
| E9 Observability | [E9-observability-tests-cicd.md](../70-querschnitt-hintergrund/E9-observability-tests-cicd.md) | Done | [AUT-185](https://linear.app/autoone/issue/AUT-185) |
| E10 Löschpfade | [E10-loeschpfade.md](../80-querschnitt-loeschpfade/E10-loeschpfade.md) | Done | [AUT-186](https://linear.app/autoone/issue/AUT-186) |
| E11 Konsolidierung | *diese Datei* | Done | [AUT-187](https://linear.app/autoone/issue/AUT-187) |

---

## 2. Vollständiger Inkonsistenz-Index (E0-verifiziert + E2–E10 Ergänzungen)

### 2.1 Widerlegte Inkonsistenzen (I1, I7, I11, I12, I14)

Diese aus AUT-175 stammenden Annahmen wurden in E0 durch Code-Evidenz widerlegt.
Sie sind **keine** offenen Baustellen — der Code verhält sich korrekt.

| ID | Beschreibung | Widerlegungs-Evidenz | Etappe |
|---|---|---|---|
| I1 | `i2c_address` fehlt im NVS-Schema | `NVS_SEN_I2C "sen_%d_i2c"` in `config_manager.cpp` schreibt und liest uint8 | E2 |
| I7 | Heartbeat erkennt nur Totalverlust | AUT-134-Fix: `esp_count != db_count` erkennt jeden Drift | E3 |
| I11 | KaiserHandler ist Stub | Vollständig implementiert: Command-Routing, Sync-Logik | E3 |
| I12 | Debug-Endpoints ohne Monitoring | Admin-Guard ist korrekte Security-Maßnahme, kein Defekt | E7 |
| I14 | sensor_data Metadata ohne i2c_address | `if i2c_address: sensor_metadata["i2c_address"] = i2c_address` | E3 |

---

### 2.2 Bestätigte Inkonsistenzen aus AUT-175 (I2–I10)

| ID | Beschreibung | Schwere | Etappe | Inline-Verortung |
|---|---|---|---|---|
| I2 | `actuator_type` Mismatch: Config="digital" vs. States="relay" | Medium | E2/E4 | [E1 §2.1](../00-uebersicht/E1-architektur-gesamtueberblick.md#21-el-trabajante-esp32--c), [E2 §4](../10-firmware/E2-firmware-schicht.md) |
| I3 | Tabellen-Namens-Drift: users→user_accounts, heartbeat_logs→esp_heartbeat_logs | Low | E3/E6 | [E1 §2.2](../00-uebersicht/E1-architektur-gesamtueberblick.md#222-datenbank-schicht), [E6 §8](../50-querschnitt-db/E6-datenbank-schema.md) |
| I4 | `--ao-*` Token-Präfix existiert nicht | Low | E4 | [E1 §2.3](../00-uebersicht/E1-architektur-gesamtueberblick.md#23-el-frontend-vue-3--typescript), [E4 §9](../30-frontend/E4-frontend-schicht.md) |
| I5 | VIRTUAL-Filter: 8 Callpoints, nur 1 Filterstelle | High | E3 | [E1 §2.2](../00-uebersicht/E1-architektur-gesamtueberblick.md#221-mqtt-schicht-17-handler), [E3 §5](../20-server/E3-server-schicht.md) |
| I6 | Soft-Delete nur esp_devices + zones; alle anderen cascade | Medium | E6 | [E1 §2.2](../00-uebersicht/E1-architektur-gesamtueberblick.md#222-datenbank-schicht), [E6 §4](../50-querschnitt-db/E6-datenbank-schema.md), [E10 §1](../80-querschnitt-loeschpfade/E10-loeschpfade.md) |
| I8 | `clean_session=true` → QoS-1 Messages bei Disconnect verloren | High | E2/E5 | [E1 §2.1](../00-uebersicht/E1-architektur-gesamtueberblick.md#21-el-trabajante-esp32--c), [E2 §6](../10-firmware/E2-firmware-schicht.md), [E5 §8](../40-querschnitt-mqtt/E5-mqtt-topic-matrix.md) |
| I9 | SHT31: kein Adafruit-Layer, direktes I2C (Command 0x2400) | Info | E2 | [E2 §3](../10-firmware/E2-firmware-schicht.md) |
| I10 | `sensor_type_registry.py` unter `src/sensors/`, nicht `src/services/` | Low | E3 | [E1 §2.2](../00-uebersicht/E1-architektur-gesamtueberblick.md#223-datenbank-schicht), [E3 §5](../20-server/E3-server-schicht.md) |
| I13 | sensorId-Format + DS18B20-Overwrite-Bug bei Multi-Sensor auf gleichem GPIO | High | E4 | [E1 §2.3](../00-uebersicht/E1-architektur-gesamtueberblick.md#23-el-frontend-vue-3--typescript), [E4 §10](../30-frontend/E4-frontend-schicht.md) |

---

### 2.3 Neu entdeckte Inkonsistenzen aus E0 (E1–E5)

| ID | Beschreibung | Schwere | Etappe | Inline-Verortung |
|---|---|---|---|---|
| E1 | WebSocket EventType-Union: ~16 Typen typisiert, 31 auf Server | Medium | E4 | [E1 §2.3](../00-uebersicht/E1-architektur-gesamtueberblick.md#23-el-frontend-vue-3--typescript), [E4 §6](../30-frontend/E4-frontend-schicht.md) |
| E2 | `zones` Soft-Delete ohne Cascade für verwaiste Subzones | Medium | E6/E10 | [E1 §2.2](../00-uebersicht/E1-architektur-gesamtueberblick.md#222-datenbank-schicht), [E6 §4](../50-querschnitt-db/E6-datenbank-schema.md), [E10 §4](../80-querschnitt-loeschpfade/E10-loeschpfade.md) |
| E3 | `notification_logs` fehlt `device_id`-Spalte (nur `esp_uuid` als String) | Low | E6/E8 | [E6 §2](../50-querschnitt-db/E6-datenbank-schema.md), [E8 §3](../70-querschnitt-hintergrund/E8-background-services.md) |
| E4 | Alembic: 4 Merge-Points (DAG statt linearer History) | Low | E6 | [E1 §2.2](../00-uebersicht/E1-architektur-gesamtueberblick.md#222-datenbank-schicht), [E6 §6](../50-querschnitt-db/E6-datenbank-schema.md) |
| E5 | `CentralScheduler` Singleton ohne Health-Endpoint | Medium | E8/E9 | [E8 §2](../70-querschnitt-hintergrund/E8-background-services.md), [E9 §7](../70-querschnitt-hintergrund/E9-observability-tests-cicd.md) |

---

### 2.4 Neu entdeckte Inkonsistenzen aus E2–E10

*Stand: E2, E3, E5, E7, E8, E10 ausgewertet. E4, E6, E9 ausstehend.*

| ID | Beschreibung | Schwere | Etappe | Inline-Verortung |
|---|---|---|---|---|
| E2-relay | `relay`-Typ im ActuatorManager erzeugt `PumpActuator`-Instanz; `getType()` gibt `"pump"` statt `"relay"` zurück | High | E2 | [E2 §4](../10-firmware/E2-firmware-schicht.md#4-aktor-subsystem) |
| E2-virtual-filter | VIRTUAL-Filter in `config_builder.py:290-294` prüft `interface_type` statt `VIRTUAL_SENSOR_TYPES`-Menge — Wartungsrisiko bei Typ-Erweiterung | Medium | E3 | [E3 §5](../20-server/E3-server-schicht.md#5-sensor-registry-und-config-builder) |
| E5-orphan-batch | `sensor/batch` Topic: ESP32-Builder vorhanden, Server-Handler fehlt — Nachrichten werden stillschweigend verworfen | High | E5 | [E5 §2](../40-querschnitt-mqtt/E5-mqtt-topic-matrix.md) |
| E5-orphan-subzone | `subzone/status` Topic: ESP32-Builder vorhanden, Server-Handler fehlt | Medium | E5 | [E5 §2](../40-querschnitt-mqtt/E5-mqtt-topic-matrix.md) |
| E5-emergency-comment | `actuator/emergency`: Kommentar "ESP never subscribes" — falsch, ESP subscribed tatsächlich | Low | E5 | [E5 §2](../40-querschnitt-mqtt/E5-mqtt-topic-matrix.md) |
| E5-heartbeat-flag | `heartbeat_metrics` Topic hinter Compile-Flag — Dokumentations-Gap, Verhalten im Production-Build unklar | Low | E5 | [E5 §4](../40-querschnitt-mqtt/E5-mqtt-topic-matrix.md) |
| E7-cors | `CORSSettings.allow_methods` konfigurierbar, aber in `main.py` durch hartcodierten `allow_methods=["*"]` ignoriert | Medium | E7 | [E7 §9](../60-querschnitt-auth/E7-auth-security-acl.md) |
| E7-mqtt-hash | Mosquitto-Passwort-Datei nutzt `$6$`-SHA-512-Format — Kompatibilität mit `mosquitto_passwd`-Tool (≥2.0) ungesichert | Low | E7 | [E7 §10](../60-querschnitt-auth/E7-auth-security-acl.md) |
| E8-jobs-count | `CentralScheduler` hat 16+ Jobs (8 MaintenanceService + 8+ Lifespan-Jobs), nicht 8 wie dokumentiert | Low | E8 | [E8 §2](../70-querschnitt-hintergrund/E8-background-services.md) |
| E8-ai-hardcode | `AiService` nutzt `claude-opus-4-7` hardcodiert — kein Settings-Eintrag, kein Modell-Override | Medium | E8 | [E8 §3](../70-querschnitt-hintergrund/E8-background-services.md) |
| E10-cascade-lücke | ESP Soft-Delete lässt `sensor_configs`, `actuator_configs`, `subzone_configs` in DB (SQLAlchemy cascade greift nur bei physischem `session.delete()`) | High | E10 | [E10 §3](../80-querschnitt-loeschpfade/E10-loeschpfade.md) |
| E10-no-restore | Kein `POST /v1/esp/devices/{id}/restore`-Endpoint (nur Zonen haben `/reactivate`) | Medium | E10 | [E10 §7](../80-querschnitt-loeschpfade/E10-loeschpfade.md) |
| E10-audit-lücke | ESP-Delete, Sensor-Config-CRUD und Zone-Delete generieren keine Audit-Log-Einträge | High | E10 | [E10 §8](../80-querschnitt-loeschpfade/E10-loeschpfade.md) |
| E10-retention | `SENSOR_DATA_RETENTION_ENABLED=false` per Default — sensor_data wächst unbegrenzt | High | E10 | [E10 §10](../80-querschnitt-loeschpfade/E10-loeschpfade.md) |
| E4-sensorid-dual | Zwei sensorId-Formate koexistieren: internes Format `espId:gpio:sensorType` vs. URL-Format `espId-gpio` — kein einheitlicher Konverter | Medium | E4 | [E4 §10](../30-frontend/E4-frontend-schicht.md#10-sensorid-konstruktion) |
| E4-ws-union | WebSocket-Union: 44 `MessageType`-Strings definiert, aber nur 30 Interface-Typen — 14 Handler ohne TypeScript-Typisierung | Medium | E4 | [E4 §6](../30-frontend/E4-frontend-schicht.md#6-websocket-integration) |
| E6-subzone-fk | `subzone_configs.parent_zone_id` hat keinen FK-Constraint zu `zones.zone_id` — nur Application-Level-Integrität | Medium | E6 | [E6 §7](../50-querschnitt-db/E6-datenbank-schema.md) |
| E6-audit-fk | `device_zone_changes.esp_id` hat keinen FK zu `esp_devices.device_id` — undokumentierte Design-Entscheidung | Low | E6 | [E6 §7](../50-querschnitt-db/E6-datenbank-schema.md) |
| E6-tables-count | DB hat **34** Tabellen (nicht 32 wie E0 ermittelte) — `command_intents` und `command_outcomes` fehlten bei E0-Zählung | Low | E6 | [E6 §2](../50-querschnitt-db/E6-datenbank-schema.md) |
| E6-notification-logs | `notification_logs`-Tabelle existiert nicht — E3-Inkonsistenz war falsch lokalisiert; korrekt: `notifications.extra_data` (JSONB) enthält `esp_id` als String | Info | E6 | [E6 §2](../50-querschnitt-db/E6-datenbank-schema.md) |
| E9-wokwi-count | `CI_PIPELINE.md` nennt 173 Wokwi-Szenarien, `wokwi-tests.yml` zählt 191 — Diskrepanz von 18 Szenarien | Low | E9 | [E9 §5](../70-querschnitt-hintergrund/E9-observability-tests-cicd.md) |
| E9-pytest-cov | `pyproject.toml addopts` ohne `--cov`, CI übergibt `--cov` explizit — Coverage-Konfiguration zweigeteilt | Low | E9 | [E9 §5](../70-querschnitt-hintergrund/E9-observability-tests-cicd.md) |
| E9-mosquitto-health | `mosquitto-exporter` ohne Health-Check (kein Shell im scratch-Image) — nur via Prometheus-Target überwachbar | Low | E9 | [E9 §7](../70-querschnitt-hintergrund/E9-observability-tests-cicd.md) |
| E9-playwright-baseline | Visual-Regression-Baselines im Repo vorhanden, aber `playwright.config.ts` suggeriert CI-Ausschluss — Widerspruch unklar | Low | E9 | [E9 §5](../70-querschnitt-hintergrund/E9-observability-tests-cicd.md) |

---

## 3. Priorisierungs-Matrix

Alle bestätigten Inkonsistenzen nach Handlungsbedarf sortiert:

### Priorität 1 — Sofortiger Handlungsbedarf

| ID | Beschreibung | Risiko | Empfehlung |
|---|---|---|---|
| **I5** | VIRTUAL-Filter nur 1 Stelle bei 8 Callpoints | Neuer Callpoint übergibt VIRTUAL-Sensor an ESP32 → Absturz/Fehler möglich | Filter in Repository-Layer verlagern |
| **I8** | clean_session=true bei QoS-1 | Config-Commands gehen bei Disconnect verloren | `disable_clean_session = 1` + persistente Client-ID |
| **I13** | DS18B20-Overwrite-Bug | Zwei OneWire-Sensoren auf gleichem GPIO → zweiter überschreibt ersten | sensorId um Adresse/Index erweitern |
| **E1/E4-ws-union** | WS-Event-Union: 44 Strings, 30 typisiert, 14 als `any` | TypeScript-Garantien gebrochen für 14 Handler | Union aus Server-WS-Enum generieren |
| **E5-orphan-batch** | `sensor/batch` Topic ohne Server-Handler | Nachrichten werden stillschweigend verworfen | Handler implementieren oder Topic entfernen |
| **E10-cascade-lücke** | ESP Soft-Delete lässt sensor_configs in DB | Orphaned Configs akkumulieren sich, verfälschen Zählungen | Explizites Config-Cleanup im Soft-Delete-Path |
| **E10-retention** | sensor_data Retention deaktiviert (Default) | DB wächst unbegrenzt → Performance-Degradation | `SENSOR_DATA_RETENTION_ENABLED=true` + Retention-Policy konfigurieren |
| **E2-relay** | `relay`-Typ erzeugt `PumpActuator`, `getType()` = `"pump"` | Server-Logs und Status-Reports typ-inkonsistent | Factory-Mapping korrigieren |

### Priorität 2 — Mittelfristiger Handlungsbedarf

| ID | Beschreibung | Risiko | Empfehlung |
|---|---|---|---|
| **I2** | actuator_type relay↔digital Mismatch | Frontend-Rendering-Logik muss zwei Werte kennen | Einheitliches Enum serverseitig |
| **I6** | Soft-Delete nur für 2 Tabellen | Versehentlich gelöschte Sensoren/User nicht wiederherstellbar | Soft-Delete-Strategie dokumentieren/erweitern |
| **E2** | zones Soft-Delete ohne Subzone-Cascade | Zone löschen → verwaiste Subzones | Cascade für Zone-Subzone-Relation |
| **E5** | CentralScheduler ohne Health-Endpoint | Job-Ausfälle unsichtbar | `/health/scheduler` Endpoint hinzufügen |

### Priorität 3 — Dokumentationsbereinigung

| ID | Beschreibung | Empfehlung |
|---|---|---|
| **I3** | Tabellennamen-Drift in Doku | Alle Referenzen auf `user_accounts`, `esp_heartbeat_logs` aktualisieren |
| **I4** | CSS-Token-Präfix-Annahme | Doku auf Tailwind-Basis korrigieren |
| **I9** | SHT31 kein Adafruit-Layer | Als bekanntes Design-Pattern dokumentieren (bewusste Entscheidung) |
| **I10** | sensor_type_registry.py Pfad | Alle Agenten-Prompts auf `src/sensors/` korrigieren |
| **E3** | notification_logs ohne device_id FK | Entscheidung dokumentieren oder FK hinzufügen |
| **E4** | 4 Alembic Merge-Points | Squash-Migration planen (nach vollständigem Test) |

---

## 4. IST-Zählungen (Sprint-Gesamtbilanz, E2–E10 verifiziert)

| Metrik | E0-Schätzung | E2–E10 final | Quelle |
|---|---|---|---|
| Sensor-Typen | 9 | **9** ✓ | E2 |
| Aktor-Typen | 4 | **4** ✓ | E2 |
| MQTT-Handler (Server) | 17 | **17** ✓ | E3, E5 |
| MQTT-Topics gesamt | — | **34** | E5 |
| REST-Router (aktiv) | — | **30** | E3 |
| Vue-Komponenten | 148 | **148** ✓ | E4 |
| Pinia-Stores | — | **23** (22 shared + 1 ESP) | E4 |
| Composables | — | **36** | E4 |
| WebSocket-MessageType-Strings | 31 | **44** (30 Interface-typisiert) | E4 |
| DB-Tabellen | 32 | **34** (`command_intents` + `command_outcomes` neu) | E6 |
| Alembic-Migrationen | 60 | **60** ✓ | E6 |
| Alembic-Merge-Points | 4 | **4** ✓ | E6 |
| CentralScheduler-Jobs | 8 | **16+** (8 Maintenance + 8+ Lifespan) | E8 |
| Notification-Trigger-Quellen | 4 | **4** ✓ | E8 |
| JWT-Blacklist | DB-Tabelle | SHA256-Hash, 3 Mechanismen ✓ | E7 |
| Auth-Rollen | — | **3** (viewer, operator, admin) | E7 |
| Docker-Compose-Services | — | **13** (4 Profile) | E9 |
| Wokwi-Szenarien | — | **191** (52 Core + 139 Extended) | E9 |
| Playwright-Browser-Projekte | — | **6** | E9 |
| Grafana-Alert-Rules | — | **37** in 8 Gruppen | E9 |

---

## 5. Wissenslücken (E0 identifiziert, durch Etappen-Agenten geschlossen)

| Lücke | E0-Status | Geschlossen durch |
|---|---|---|
| MaintenanceService (Jobs, Scheduler-Typ) | Sondiert | E8 |
| JWT-Blacklist-Mechanismus | Grundriss bekannt | E7 |
| Notification-Pipeline (4 Quellen) | Grundriss bekannt | E8 |
| Alembic-Merge-Points (4 Stück) | Identifiziert | E6 |
| SHT31-I2C-Protokoll-Konformität | Teilweise | E2 |

---

## 6. Architektur-Entscheidungen (ADR-Kandidaten)

Folgende Befunde des Sprints sind Kandidaten für Architecture Decision Records (ADRs):

| Entscheidung | Aktueller Stand | Empfehlung |
|---|---|---|
| Server-zentrischer Ansatz | Konsequent umgesetzt | ADR dokumentieren als Leitprinzip |
| clean_session=true (I8) | Bewusst? oder Versehen? | ADR: clean_session-Strategie |
| Soft-Delete nur für 2 Tabellen (I6) | Möglicherweise bewusst | ADR: Lösch-Strategie |
| VIRTUAL-Filter-Singleton (I5) | Design-Risiko | ADR: Filter-Architektur |
| SHT31 ohne Adafruit (I9) | Bewusste Entscheidung | ADR: Treiber-Policy |

---

## 7. Nachfolge-Aufgaben (Linear-Kandidaten)

Diese Inkonsistenzen haben jeweils das Potential für eigene Linear-Issues:

| Inkonsistenz | Empfohlener Issue-Typ | Priorität |
|---|---|---|
| I5 VIRTUAL-Filter | `auftragstyp:fix` | Urgent |
| I8 clean_session | `auftragstyp:fix` | High |
| I13 DS18B20-Overwrite | `auftragstyp:fix` | High |
| E1 WS-Event-Union | `auftragstyp:fix` | High |
| I2 actuator_type | `auftragstyp:refactor` | Normal |
| E5 Scheduler Health | `auftragstyp:feat` | Normal |
| E2 Zone-Cascade | `auftragstyp:fix` | Normal |

---

## 8. Dokument-Vollständigkeits-Status

| Etappe | Vollständig | Ausstehend |
|---|---|---|
| E0 | ✓ vollständig | — |
| E1 | ✓ vollständig | — |
| E2 | Agenten-Ergebnis ausstehend | Füllt Abschnitte 2.4 und 3 |
| E3 | Agenten-Ergebnis ausstehend | Füllt Abschnitte 2.4 und 3 |
| E4 | Agenten-Ergebnis ausstehend | Füllt Abschnitte 2.4 und 3 |
| E5 | Agenten-Ergebnis ausstehend | Füllt Abschnitte 2.4 und 3 |
| E6 | Agenten-Ergebnis ausstehend | Füllt Abschnitte 2.4 und 3 |
| E7 | Agenten-Ergebnis ausstehend | Füllt Abschnitte 2.4 und 3 |
| E8 | Agenten-Ergebnis ausstehend | Füllt Abschnitte 2.4 und 3 |
| E9 | Agenten-Ergebnis ausstehend | Füllt Abschnitte 2.4 und 3 |
| E10 | Agenten-Ergebnis ausstehend | Füllt Abschnitte 2.4 und 3 |
| E11 | Teilweise vollständig | Abschnitt 2.4 nach E2–E10-Agenten |
