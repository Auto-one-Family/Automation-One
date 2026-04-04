# Paket 04: ESP32 Speicherkarte RAM vs NVS (P1.4)

## 1) Ziel und Scope

Dieses Dokument erstellt eine belastbare Speicherkarte fuer `El Trabajante` mit Trennung zwischen:
- RAM-only (volatile),
- NVS-persistiert,
- zur Laufzeit abgeleitet.

Regelbasis: ausschliesslich die in P1.4 genannten Source-of-Truth-Dokumente aus Paket 02/03.

## 2) Quellenbasis und Evidenzgrad

Verwendete Quellen:
- `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensorhandling-end-to-end.md`
- `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-contract-matrix.md`
- `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-fehler-recovery-matrix.md`
- `arbeitsbereiche/automation-one/architektur-autoone/esp32/paket-03-esp32-sensor-timing-und-lastprofil.md`
- `paket-02-esp32-runtime-lifecycle-state-model.md`
- `paket-02-esp32-trigger-matrix.md`
- `paket-02-esp32-core-interaktionsbild.md`
- `paket-02-esp32-degraded-recovery-szenarien.md`

Nicht auffindbar im aktuellen Workspace:
- `arbeitsbereiche/automation-one/architektur-autoone/roadmap-komplettanalyse.md`

Evidenzstufen:
- **sicher**: explizit in den Quellen genannt.
- **teilweise**: aus mehreren Quellen konsistent ableitbar, aber ohne volle Feld-/Schema-Details.
- **offen**: in Quellen als Luecke/Frage markiert.

## 3) Speicherobjekt-Inventar (FW-MEM-XXX)

| ID | Objekt | Klasse | Owner/Scope | Persistenz | Restore nach Reboot | Evidenz |
|---|---|---|---|---|---|---|
| FW-MEM-001 | `SystemState` (`STATE_BOOT`, `STATE_PENDING_APPROVAL`, `STATE_OPERATIONAL`, `STATE_SAFE_MODE_PROVISIONING`, `STATE_ERROR`) | Lifecycle | Shared (Core0+Core1 Zugriff, zentrale State-Maschine) | NVS-persistiert (State-Repair/Set-State-Pfade) | deterministisch, inkl. Repair-Logik | sicher |
| FW-MEM-002 | Boot-Counter/Bootloop-Indikator (`boot_count > 5 in <60s`) | Lifecycle | Shared, Boot-Pfad | persistent (fuer Bootloop-Latch relevant) | ja, sonst keine Bootloop-Erkennung moeglich | teilweise |
| FW-MEM-003 | Approval-Status (approved/pending/rejected) | Runtime+Policy | Shared, prim. Core0 Triggerpfad | persistiert bei Approval (`approved persistieren`) | ja, bestimmt Startmodus nach Reboot | sicher |
| FW-MEM-004 | `g_mqtt_connected` | Connectivity | Shared Atomic, geschrieben Core0, gelesen Core1 | RAM-only | nein (neu initialisiert) | sicher |
| FW-MEM-005 | `g_last_server_ack_ms` / Timeout-Flags | Connectivity/Safety | Shared Atomics Core0<->Core1 | RAM-only | nein | sicher |
| FW-MEM-006 | `g_server_timeout_triggered` | Safety Overlay | Shared Atomic | RAM-only | nein | sicher |
| FW-MEM-007 | Config-Update Queue (`g_config_update_queue`) | Queue | Core0 Producer, Core1 Consumer | RAM-only | nein (volatile Queue-Inhalt) | sicher |
| FW-MEM-008 | Sensor-Command Queue (`g_sensor_cmd_queue`) | Queue | Core0 Producer, Core1 Consumer | RAM-only | nein | sicher |
| FW-MEM-009 | Actuator-Command Queue (`g_actuator_cmd_queue`) | Queue | Core0 Producer, Core1 Consumer | RAM-only | nein | sicher |
| FW-MEM-010 | Publish Queue (`g_publish_queue`) | Queue | Core1 Producer, Core0 Consumer | RAM-only | nein | sicher |
| FW-MEM-011 | MQTT Outbox (ESP-IDF intern) | Transportpuffer | Core0 nahe MQTT Task | RAM-only | nein | sicher |
| FW-MEM-012 | Sensor-Konfiguration (GPIO, Typ, Modus, Intervalle, Adressen) | Config | Core1 Owner (`sensors_[]`) | NVS-persistiert (`saveSensorConfig`) + RAM-Spiegel | ja, ueber Config-Load | sicher |
| FW-MEM-013 | Laufzeit-Sensorinstanzen (`sensors_[]`, Registry-Mappings, active flags) | Runtime | Core1 Owner | RAM-only (aus Config neu aufgebaut) | indirekt (abgeleitet aus persistierter Config) | sicher |
| FW-MEM-014 | Sensor Value-Cache (`getSensorValue`, stale-Check 5min) | Runtime-Daten | Core1 Owner, gelesen im Offline-Eval | RAM-only | nein (nach Reboot leer/stale) | sicher |
| FW-MEM-015 | Rule-Set (Offline-Regeln, Schwellwerte, Zeitfilter, Day-Mask) | Safety Config | Core1 (`offline_mode_manager`) | NVS-persistiert (inkl. CRC/Size-Pruefung beim Laden) | ja, wenn NVS valide | sicher |
| FW-MEM-016 | Rule-Runtime-Status (`is_active`, Evaluationszustand) | Safety Runtime | Core1 | partiell in NVS gespiegelt (`is_active`), Rest RAM-only | teilweise | sicher |
| FW-MEM-017 | `server_override` pro Aktor in `OFFLINE_ACTIVE` | Safety Overlay | Core1 | RAM-only (explizit transient) | nein | sicher |
| FW-MEM-018 | Circuit-Breaker Zaehler/Zustand pro Sensor (OPEN/HALF_OPEN/CLOSED) | Runtime-Schutz | Core1 Sensorpfad | RAM-only | nein | sicher |
| FW-MEM-019 | Last-Reading Timestamps / Intervallsteuerung | Runtime-Timing | Core1 | RAM-only | nein | sicher |
| FW-MEM-020 | Provisioning-/WiFi-Konfiguration | Connectivity Config | Core0/Boot | NVS-persistiert (Provisioning-Pfade) | ja | sicher |
| FW-MEM-021 | Emergency-Aktivierung (`NOTIFY_EMERGENCY_STOP`, emergency state) | Safety | Core1 priorisiert, Trigger Core0 | RAM-only (latched im Runtime-State) | unklar fuer reboot-uebergreifend | teilweise |
| FW-MEM-022 | Abgeleitete Payload-Felder (`value`, `unit`, `quality`, `time_valid`) | Abgeleitet | Core1 Sensor-Pipeline | RAM-only berechnet je Messung | nein, immer neu berechnet | sicher |
| FW-MEM-023 | Topic-/Contract-Zuordnung (TopicBuilder, Sensor-Type Mapping) | Abgeleitet | Core0/1 je Pfad | RAM-only/Codekonstante | nein (aus Code/Config ableitbar) | sicher |

## 4) Klassifikation nach Speicherklasse

### 4.1 RAM-only (volatile)
`FW-MEM-004..011`, `FW-MEM-013`, `FW-MEM-014`, `FW-MEM-017..019`, `FW-MEM-021..023`.

### 4.2 NVS-persistiert
`FW-MEM-001`, `FW-MEM-003`, `FW-MEM-012`, `FW-MEM-015`, `FW-MEM-020` (+ teilpersistenz `FW-MEM-016`, vermutlich `FW-MEM-002`).

### 4.3 Laufzeit-abgeleitet
`FW-MEM-013`, `FW-MEM-022`, `FW-MEM-023` sowie Teile von `FW-MEM-016`.

## 5) Owner- und Core-Scope-Zusammenfassung

- **Core 0 (Communication Owner):** WiFi/MQTT, Entry Topics, Queue-Producer fuer Config/Commands, Queue-Consumer fuer Publish.
- **Core 1 (Safety Owner):** Sensor-/Aktor-Execution, Config-Apply, Offline-Rules, Value-Cache, Safety-Entscheidung.
- **Shared:** Atomics (`mqtt_connected`, ACK-Timestamps), SystemState, Queue-Handles.

## 6) Deterministische Restore-Faehigkeit (Kurzbild)

Deterministisch wiederherstellbar:
- Persistierte Config-/Lifecycle-Objekte (`FW-MEM-001`, `FW-MEM-003`, `FW-MEM-012`, `FW-MEM-015`, `FW-MEM-020`).

Nicht deterministisch ueber Reboot:
- Queue-Inhalte, Sensor-Value-Cache, server-overrides, temporale Runtime-Zustandszaehler.

Direkte P1.4-Kernaussage:
- Datenverlust in RAM-only Objekten ist erwartbar/safe, solange NVS-Objekte konsistent sind und Restore-Reihenfolge korrekt bleibt.

