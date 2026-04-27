# E0 — Reality-Check + Sprint-Planung

> **Linear:** [AUT-176](https://linear.app/autoone/issue/AUT-176)
> **Master-Issue:** [AUT-175](https://linear.app/autoone/issue/AUT-175)
> **Datum:** 2026-04-26
> **Status:** Done
> **Methode:** Vollständige Code-Verifikation via Explore-Agent (77 Tool-Calls, 318s)
> **Zurück:** [README.md](../README.md)

---

## Überblick

Dieses Dokument verifiziert die IST-Aussagen aus AUT-175 gegen den echten Codestand.
Es bildet die Faktenbasis für alle folgenden Etappen (E1–E11).

**Ergebnis-Zusammenfassung:**

| Kategorie | Anzahl |
|-----------|--------|
| IST-Behauptungen verifiziert (✅) | 7 |
| IST-Behauptungen widerlegt (❌) | 5 |
| IST-Behauptungen teilweise korrekt (⚠️) | 2 |
| Neu gefundene Inkonsistenzen | 5 (E1–E5) |
| Wissenslücken geschlossen | 5 |
| Zählungen stark veraltet | 3 (Handler, Komponenten, WS-Events) |

---

## A — Datei-Existenz

| # | Behaupteter Pfad | Existiert? | Tatsächlicher Pfad | Abweichung |
|---|-----------------|-----------|-------------------|-----------|
| 1 | `El Trabajante/src/services/sensor/sensor_manager.cpp` | ✅ | Exakt | — |
| 2 | `El Trabajante/src/services/actuator/actuator_manager.cpp` | ✅ | Exakt | — |
| 3 | `El Trabajante/src/services/config/config_manager.cpp` | ✅ | Exakt | — |
| 4 | `El Trabajante/src/services/communication/mqtt_client.cpp` | ✅ | Exakt | — |
| 5 | `El Trabajante/src/main.cpp` | ✅ | Exakt | — |
| 6 | `El Trabajante/src/models/actuator_types.h` | ✅ | Exakt | — |
| 7 | `El Trabajante/src/models/sensor_registry.cpp` | ✅ | Exakt | — |
| 8 | `src/sensors/sensor_type_registry.py` (I10) | ✅ | `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py` | Pfad korrekt — IST-Doku hatte `src/services/` → **Pfad-Drift bestätigt** |
| 9 | `El Servador/god_kaiser_server/src/services/config_builder.py` | ✅ | Exakt | — |

---

## B — Zählungen (IST vs. verifiziert)

| Was | IST-Behauptung | Code-verifiziert | Delta | Bewertung |
|-----|---------------|-----------------|-------|-----------|
| DB-Tabellen (`__tablename__`) | 31 | **34+** (Glob auf Model-Files) | +3 | Mehr vorhanden, ggf. weitere in nicht gescannten Files |
| REST-Router-Dateien | 31 | **30–31** (inkl. websocket/realtime.py) | ~0 | Im Wesentlichen korrekt |
| MQTT-Handler (ohne base/init) | 13 (12+1 Stub) | **17 aktive** — kein Stub | +4 | Stark veraltet — 4 neue Handler seit IST-Aufnahme |
| Background-Services | 5 | **5** | 0 | ✅ Korrekt |
| Frontend-Komponenten | ~97 | **148** | +51 | Stark veraltet — massives Component-Wachstum |
| WebSocket-Event-Typen | 16 | **31** | +15 | Massiv veraltet — Sequences, Logic, Rule-Events hinzugekommen |

### B1 — DB-Tabellen (34+ gefunden)

Alle verifizierten Tabellennamen aus SQLAlchemy-Model-Dateien:

`ai_predictions`, `token_blacklist`, `command_intents`, `command_outcomes`, `audit_logs`, `calibration_sessions`, `email_log`, `cross_esp_logic`, `logic_execution_history`, `logic_hysteresis_states`, `device_zone_changes`, `device_active_context`, `actuator_configs`, `actuator_states`, `actuator_history`, `library_metadata`, `dashboards`, `kaiser_registry`, `esp_ownership`, `esp_heartbeat_logs`, `system_config`, `diagnostic_reports`, `esp_devices`, `sensor_type_defaults`, `zone_contexts`, `notifications`, `notification_preferences`, `plugin_configs`, `plugin_executions`, `user_accounts`, `subzone_configs`, `sensor_configs`, `sensor_data`, `zones`

**Tabellen-Namens-Drift (I3 bestätigt):** `users` → `user_accounts`, `heartbeat_logs` → `esp_heartbeat_logs` (korrekt in IST), `logic_rules` → `cross_esp_logic`.

### B2 — MQTT-Handler (17 aktive, kein Stub)

Alle Handler in `El Servador/god_kaiser_server/src/mqtt/handlers/` (ohne `base_handler.py`, `__init__.py`):

1. `actuator_alert_handler.py`
2. `actuator_handler.py`
3. `actuator_response_handler.py`
4. `calibration_response_handler.py`
5. `config_handler.py`
6. `diagnostics_handler.py`
7. `discovery_handler.py`
8. `error_handler.py`
9. `heartbeat_handler.py`
10. `heartbeat_metrics_handler.py` ← neu seit IST-Aufnahme
11. `intent_outcome_handler.py` ← neu
12. `intent_outcome_lifecycle_handler.py` ← neu
13. `lwt_handler.py`
14. `queue_pressure_handler.py` ← neu
15. `sensor_handler.py`
16. `subzone_ack_handler.py`
17. `zone_ack_handler.py`

`kaiser_handler.py` existiert **nicht** — weder aktiv noch als Stub.

### B3 — Background-Services (Pfade verifiziert)

| Service | Klasse | Tatsächlicher Pfad |
|---------|--------|--------------------|
| LogicEngine | `LogicEngine` | `src/services/logic_engine.py` |
| LogicScheduler | `LogicScheduler` | `src/services/logic_scheduler.py` |
| MaintenanceService | `MaintenanceService` | `src/services/maintenance/service.py` |
| SensorScheduler | `SensorSchedulerService` | `src/services/sensor_scheduler_service.py` |
| SimulationScheduler | `SimulationScheduler` | `src/services/simulation/scheduler.py` |

Klassen-Namen: `SensorSchedulerService` (nicht `SensorScheduler`), `SimulationScheduler` unter `simulation/scheduler.py` (Unterordner).

---

## C — Inkonsistenz-Verifikation (I1–I14)

### I1 — NVS-Key `sen_{i}_i2c` fehlt

**Status:** ❌ WIDERLEGT

**Evidenz:** `El Trabajante/src/services/config/config_manager.cpp`

```cpp
// Zeile 1529:
#define NVS_SEN_I2C  "sen_%d_i2c"

// Zeile 1862–1863 (Schreiben):
snprintf(key, sizeof(key), NVS_SEN_I2C, index);
success &= storageManager.putUInt8(key, config.i2c_address);

// Zeile 2039–2040 (Lesen):
snprintf(new_key, sizeof(new_key), NVS_SEN_I2C, i);
config.i2c_address = storageManager.getUInt8(new_key, 0);
```

Der Key wird bei `saveSensorConfig()` geschrieben und bei `loadSensorConfigs()` gelesen. Die i2c_address wird korrekt persistiert. Die IST-Behauptung war falsch.

> [!ANNAHME] I1 war unbegründet — NVS-Key existiert und funktioniert
>
> **Basis:** IST-Behauptung aus AUT-175 (organisch gewachsen, nicht code-verifiziert)
> **Zu verifizieren:** E2 (Firmware-Schicht) soll vollständiges NVS-Schema inkl. `sen_{i}_i2c` dokumentieren und den Default-Wert bei fehlendem Key (0x00 = kein I2C) beschreiben

---

### I2 — `actuator_type` Mismatch ("digital" vs. "relay")

**Status:** ✅ BESTÄTIGT — intentionale Transformation, kein stiller Fehler

**Evidenz:**

- **Firmware** (`El Trabajante/src/models/actuator_types.h:22`): `static const char* const RELAY = "relay"` — ESP32 sendet `"relay"`
- **Server** (`El Servador/god_kaiser_server/src/schemas/actuator.py:56–81`): Explizites Mapping `relay → "digital"`, `pump → "digital"`, `valve → "digital"`
- **Frontend** (`El Frontend/src/utils/labels.ts:95`): Kommentar: *"actuator_configs stores 'digital' for all relay/pump/valve actuators"*

> [!INKONSISTENZ] actuator_type: ESP sendet "relay"/"pump"/"valve", Server normalisiert zu "digital"
>
> **Beobachtung:** ESP32 nutzt spezifische Typen (`relay`, `pump`, `valve`), Server speichert alle als `digital` — Differenzierung nur über `hardware_type`-Feld. Frontend-Icon-Mapping greift auf `hardware_type`, nicht `actuator_type`.
> **Korrekte Stelle:** [E2-firmware-schicht.md](../10-firmware/E2-firmware-schicht.md) (Firmware-Seite), [E3-server-schicht.md](../20-server/E3-server-schicht.md) (Server-Normalisierung), [E4-frontend-schicht.md](../30-frontend/E4-frontend-schicht.md) (Icon-Mapping)
> **Empfehlung:** Entweder `actuator_type` auf Server gleich halten (kein Normalisieren) oder `hardware_type` als First-Class-Citizen in allen Schichten dokumentieren
> **Erst-Erkennung:** E0 (2026-04-26) — IST-Behauptung war korrekt, aber Umfang (pump/valve ebenfalls betroffen) war unvollständig

---

### I3 — Tabellen-Namens-Drift

**Status:** ✅ BESTÄTIGT

**Evidenz:**

| Falsch dokumentierter Name | Echter Tabellenname | Fundort |
|---------------------------|--------------------|---------| 
| `users` | `user_accounts` | `db/models/user.py:30` |
| `logic_rules` | `cross_esp_logic` | `db/models/logic.py:52` |
| `heartbeat_logs` | `esp_heartbeat_logs` | `db/models/esp_heartbeat.py:59` |

> [!INKONSISTENZ] Tabellen-Namens-Drift in Dokumentation
>
> **Beobachtung:** Dokumentation referenziert `users`, `logic_rules`, `heartbeat_logs` — echte Tabellennamen sind `user_accounts`, `cross_esp_logic`, `esp_heartbeat_logs`
> **Korrekte Stelle:** [E6-datenbank-schema.md](../50-querschnitt-db/E6-datenbank-schema.md)
> **Empfehlung:** Alle Referenzen in Dokumentation auf echte Tabellennamen aktualisieren
> **Erst-Erkennung:** E0 (2026-04-26) — aus IST-Behauptung AUT-175

---

### I4 — Design-Token-Prefix `--ao-*`

**Status:** ✅ BESTÄTIGT — `--ao-` kommt nicht vor

**Evidenz:**
- `--ao-`: 0 Treffer in `El Frontend/src/`
- `--color-`: 71 Treffer in `El Frontend/src/styles/tokens.css`
- `--glass-`: 28 Treffer in `El Frontend/src/styles/tokens.css`

> [!INKONSISTENZ] --ao-* Token-Prefix existiert nicht — semantische Prefixes stattdessen
>
> **Beobachtung:** Alte Wissensbasis nahm `--ao-*` als Prefix an. Korrekt sind `--color-*`, `--glass-*`, `--space-*`, `--elevation-*`
> **Korrekte Stelle:** [E4-frontend-schicht.md](../30-frontend/E4-frontend-schicht.md#design-token-system)
> **Empfehlung:** Alle internen Dokumenten, die `--ao-*` erwähnen, korrigieren. Für neue Code-Generierung: semantische Prefixes verwenden
> **Erst-Erkennung:** E0 (2026-04-26) — aus IST-Behauptung AUT-175

---

### I5 — VIRTUAL-Filter 6 Callpoints, nur 1 Filter

**Status:** ⚠️ TEILWEISE BESTÄTIGT

**Evidenz:** `build_combined_config` hat **7–8 externe Callpoints** (actuators.py 2×, sensors.py 3×, logic.py 1×, heartbeat_handler.py 1×, config_builder.py 1× intern). Filter in `config_builder.py:290–293`:

```python
if not (getattr(s, "interface_type", None) or "").upper() == "VIRTUAL"
```

Der Filter ist zentralisiert — nicht jeder Callpoint filtert selbst. Risiko: Wenn ein neuer Callpoint `build_combined_config` umgeht und direkt DB-Daten lädt, fehlt der Filter.

> [!INKONSISTENZ] VIRTUAL-Filter zentralisiert in build_combined_config — Umgehung möglich
>
> **Beobachtung:** 7–8 Callpoints → 1 Filter. Solange alle über `build_combined_config` gehen, ist der Filter sicher. Direktzugriff auf `sensor_configs`-Tabelle ohne Filter würde VIRTUAL-Sensoren exponieren.
> **Korrekte Stelle:** [E3-server-schicht.md](../20-server/E3-server-schicht.md#dual-storage-architektur)
> **Empfehlung:** Alle Direktzugriffe auf `sensor_configs` auflisten; ggf. DB-Level-View mit eingebautem Filter erwägen
> **Erst-Erkennung:** E0 (2026-04-26) — IST-Behauptung „6 Callpoints" war leicht zu niedrig (7–8 real)

---

### I6 — Soft-Delete nur 2 Tabellen

**Status:** ✅ BESTÄTIGT (Zahl korrekt, Aussage präzise)

**Evidenz:**
- `esp_devices`: `deleted_at` in `db/models/esp.py:207`
- `zones`: `deleted_at` in `db/models/zone.py:79`
- Alle anderen Tabellen: Cascade-Delete (kein `deleted_at`)

> [!INKONSISTENZ] Soft-Delete nur in esp_devices + zones — alle anderen Entitäten cascade-gelöscht
>
> **Beobachtung:** Inkonsistentes Delete-Verhalten je nach Entitäts-Typ. sensor_configs, actuator_configs, etc. haben kein deleted_at — Löschung ist permanent und sofort propagiert.
> **Korrekte Stelle:** [E6-datenbank-schema.md](../50-querschnitt-db/E6-datenbank-schema.md#soft-delete-vs-cascade), [E10-loeschpfade.md](../80-querschnitt-loeschpfade/E10-loeschpfade.md)
> **Empfehlung:** Explizite Entscheidung dokumentieren: welche Entitäten brauchen Soft-Delete? Aktuelle Praxis: nur "Haupt-Entitäten" (ESP, Zone) werden soft-gelöscht.
> **Erst-Erkennung:** E0 (2026-04-26) — aus IST-Behauptung AUT-175

---

### I7 — Heartbeat-Mismatch erkennt nur Totalverlust

**Status:** ❌ WIDERLEGT — AUT-134 hat dies behoben

**Evidenz:** `heartbeat_handler.py:1923–1927`:

```python
# AUT-134: count-drift detection.
# Reboot-loss remains covered (ESP=0 while DB>0), but we now
# also detect non-zero count drift to trigger targeted resync.
needs_sensor_push = db_sensor_count > 0 and esp_sensor_count != db_sensor_count
needs_actuator_push = db_actuator_count > 0 and esp_actuator_count != db_actuator_count
```

Die Erkennung verwendet `!=` (jede Abweichung), nicht nur `== 0`. Die IST-Behauptung beschreibt einen veralteten Zustand vor AUT-134.

> [!ANNAHME] I7 war veraltet — Mismatch-Erkennung bereits durch AUT-134 gefixt
>
> **Basis:** IST-Behauptung aus AUT-175, nicht code-verifiziert
> **Zu verifizieren:** E3 (Server-Schicht) soll den genauen Heartbeat-Resync-Mechanismus inklusive AUT-134-Änderung dokumentieren

---

### I8 — `clean_session=true` in Firmware

**Status:** ✅ BESTÄTIGT

**Evidenz:** `El Trabajante/src/services/communication/mqtt_client.cpp:335`:

```cpp
mqtt_cfg.disable_clean_session = 0;  // 0 = clean_session aktiv
```

ESP-IDF-Semantik: `disable_clean_session = 0` aktiviert `clean_session`. Bei jedem Connect beginnt eine neue Session — persistente MQTT-Subscriptions über Disconnects hinweg werden nicht wiederhergestellt.

> [!INKONSISTENZ] clean_session=true in Firmware — Config-Push bei Disconnect nicht garantiert zugestellt
>
> **Beobachtung:** ESP nutzt clean_session, d.h. keine persistente Session. QoS-2-Config-Pushes die während Offline-Phase gesendet werden, gehen verloren. Server muss nach Reconnect aktiv neu senden.
> **Korrekte Stelle:** [E2-firmware-schicht.md](../10-firmware/E2-firmware-schicht.md#mqtt-client), [E5-mqtt-topic-matrix.md](../40-querschnitt-mqtt/E5-mqtt-topic-matrix.md#qos-und-session)
> **Empfehlung:** `disable_clean_session = 1` (persistente Session) oder Server-seitiger Resend-Trigger nach Reconnect (letzteres bereits teilweise via Heartbeat-Handler implementiert)
> **Erst-Erkennung:** E0 (2026-04-26) — aus IST-Behauptung AUT-175

---

### I9 — SHT31 direktes I2C-Protokoll (kein Adafruit-Layer)

**Status:** ✅ BESTÄTIGT

**Evidenz:**
- `Adafruit_SHT31`: 0 Treffer in `El Trabajante/src/`
- Treiber in `El Trabajante/src/drivers/i2c_sensor_protocol.cpp:14–50`:
  - Command `0x2400` (High Repeatability, No Clock Stretch)
  - 6-Byte-Response: `[Temp_MSB, Temp_LSB, Temp_CRC, Hum_MSB, Hum_LSB, Hum_CRC]`
  - CRC: Polynomial `0x31`, Init `0xFF` (Sensirion-Standard)
- `temp_sensor_sht31.cpp` existiert als **leere Datei (0 Bytes)** — Artefakt (→ Neue Inkonsistenz E1)

> [!INKONSISTENZ] SHT31-Treiber: kein Adafruit-Layer, direktes I2C-Protokoll in i2c_sensor_protocol.cpp
>
> **Beobachtung:** Code-Generierung oder Dokumentation die Adafruit_SHT31 erwähnt, wäre falsch. Treiber liegt in `src/drivers/i2c_sensor_protocol.cpp`, nicht in `temp_sensor_sht31.cpp` (die Datei ist leer).
> **Korrekte Stelle:** [E2-firmware-schicht.md](../10-firmware/E2-firmware-schicht.md#i2c-bus-manager)
> **Empfehlung:** Leere `temp_sensor_sht31.cpp` entfernen oder mit korrektem Inhalt füllen (separates Issue)
> **Erst-Erkennung:** E0 (2026-04-26) — aus IST-Behauptung AUT-175

---

### I10 — `sensor_type_registry.py` Pfad

**Status:** ✅ BESTÄTIGT (Pfad-Diskrepanz wie beschrieben)

**Evidenz:**
- Tatsächlicher Pfad: `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py`
- Falsche Annahme wäre: `src/services/sensor_type_registry.py`

> [!INKONSISTENZ] sensor_type_registry.py liegt unter src/sensors/, nicht src/services/
>
> **Beobachtung:** Wer den Pfad aus dem Service-Pattern ableitet, sucht an der falschen Stelle. Die Datei liegt in einem eigenen `sensors/`-Verzeichnis.
> **Korrekte Stelle:** [E3-server-schicht.md](../20-server/E3-server-schicht.md#server-pfade)
> **Empfehlung:** Pfad in allen internen Dokumenten korrigieren
> **Erst-Erkennung:** E0 (2026-04-26) — aus IST-Behauptung AUT-175

---

### I11 — KaiserHandler ist Stub

**Status:** ❌ WIDERLEGT — Datei existiert schlicht nicht

**Evidenz:** Vollständiges Listing von `src/mqtt/handlers/` enthält keine `kaiser_handler.py`. Die Datei ist nicht vorhanden — weder aktiver Handler noch Stub. Kaiser-Kommunikation läuft über `src/api/v1/kaiser.py` (REST) und `heartbeat_handler.py` (MQTT-Discovery).

> [!ANNAHME] KaiserHandler existiert nicht — weder aktiv noch als Stub
>
> **Basis:** IST-Behauptung war falsch
> **Zu verifizieren:** E3 (Server-Schicht) soll Kaiser-Kommunikations-Pfad vollständig dokumentieren (REST + Heartbeat-Discovery statt eigener MQTT-Handler)

---

### I12 — 22% Debug-Endpoints

**Status:** ❌ WIDERLEGT — 1 von ~30 Dateien = ~3,3%, nicht 22%

**Evidenz:** In `src/api/v1/` gibt es genau eine Debug-Datei (`debug.py`) von 30 Router-Dateien = 3,3%. Die 22%-Behauptung war entweder auf Endpoint-Zahl (Anzahl Endpoints innerhalb debug.py) bezogen oder ist veraltet.

> [!ANNAHME] 22% Debug-Endpoints: Verhältnis bezieht sich auf Endpoint-Anzahl, nicht Datei-Anzahl
>
> **Basis:** 1/30 Dateien = 3,3%. Wenn debug.py selbst ~50–60 Endpoints enthält und Gesamtzahl ~263 ist: 50/263 = ~19%. Behauptung möglicherweise korrekt auf Endpoint-Ebene.
> **Zu verifizieren:** E7 (Auth + Security) soll debug.py analysieren und genaue Endpoint-Zahl dokumentieren

---

### I13 — sensorId Matching-Fehler bei Multi-Sensor

**Status:** ⚠️ RISIKO ANALYSIERT — Composable defensiv, Direktzugriff problematisch

**Evidenz:** `El Frontend/src/composables/useSensorId.ts:45–63`:

```typescript
const parts = value.split(':')
if (parts.length < 2) return { ..., isValid: false }
const espId = parts[0] || null
const gpio = parseInt(parts[1], 10)
const sensorType = parts[2] || null    // null bei 2-part Legacy
```

`CustomDashboardView.vue:124` ruft `config.sensorId.split(':')` direkt ohne `useSensorId` auf — bei Multi-Value-Sensoren (SHT31) könnte das zur falschen Sensor-Zuordnung führen.

> [!INKONSISTENZ] sensorId-Direktzugriff in CustomDashboardView umgeht useSensorId-Composable
>
> **Beobachtung:** useSensorId.ts ist defensiv gebaut und unterstützt 2-/3-teilige IDs. CustomDashboardView.vue:124 umgeht das Composable und splittet direkt — Fehler bei Legacy-IDs oder Multi-Value-Sensoren möglich.
> **Korrekte Stelle:** [E4-frontend-schicht.md](../30-frontend/E4-frontend-schicht.md#sensorid-format)
> **Empfehlung:** CustomDashboardView.vue:124 auf useSensorId-Composable umstellen
> **Erst-Erkennung:** E0 (2026-04-26) — aus IST-Behauptung AUT-175

---

### I14 — `sensor_data` Metadata ohne i2c_address

**Status:** ❌ WIDERLEGT — i2c_address wird bei nicht-null Werten eingetragen

**Evidenz:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py:449–454`:

```python
sensor_metadata = {"raw_mode": raw_mode}
if i2c_address:
    sensor_metadata["i2c_address"] = i2c_address
if onewire_address:
    sensor_metadata["onewire_address"] = onewire_address
```

`i2c_address` landet in Metadata — aber nur wenn `i2c_address != 0` und nicht null. Für Non-I2C-Sensoren korrekt fehlend. Grenzfall: `i2c_address = 0x00` im MQTT-Payload → wird als falsy behandelt und nicht gespeichert.

> [!ANNAHME] I14: i2c_address fehlt nur bei i2c_address=0 im Payload (Grenzfall)
>
> **Basis:** Code-Verifikation zeigt: `if i2c_address:` ist falsy bei 0x00. Wenn ESP i2c_address=0 sendet (z.B. nach Reboot vor Discovery), wird sie nicht in Metadata gespeichert.
> **Zu verifizieren:** E2 (Firmware) soll klären: welchen Wert sendet ESP für i2c_address bei unbekannter/nicht-discoveryier Adresse?

---

## D — Wissenslücken (geschlossen)

### D1 — MaintenanceService

**Datei:** `El Servador/god_kaiser_server/src/services/maintenance/service.py`

**Aufgaben (8 Jobs):**

| Job | Funktion | Trigger |
|-----|----------|---------|
| `cleanup_sensor_data` | Alte Sensor-Daten löschen | Täglich 03:00 Uhr (cron) |
| `cleanup_command_history` | Command-Verlauf bereinigen | Täglich 03:30 Uhr (cron) |
| `cleanup_orphaned_mocks` | Verwaiste Mock-ESPs entfernen | Stündlich (3600s) |
| `cleanup_heartbeat_logs` | Heartbeat-Logs bereinigen | Täglich 03:15 Uhr (cron) |
| `health_check_esps` | ESP-Timeout-Check | Konfigurierbar (Intervall) |
| `health_check_mqtt` | MQTT-Broker-Health | Konfigurierbar (Intervall) |
| `health_check_sensors` | Continuous-Sensor-Timeout | Konfigurierbar (Intervall) |
| `aggregate_stats` | Stats-Aggregation | Konfigurierbar (Minuten) |

Steuerung über `CentralScheduler`. Jobs conditional (aktivierbar/deaktivierbar per Settings). Cleanup-Jobs haben `dry_run`-Modus. → Detail-Dokumentation in [E8-background-services.md](../70-querschnitt-hintergrund/E8-background-services.md).

---

### D2 — JWT-Rotation und Token-Blacklist

**Mechanismus:** DB-basierte Blacklist in Tabelle `token_blacklist`.

**Implementierung:**
- `db/models/auth.py`: `TokenBlacklist`-Modell (Felder: `token_hash`, `user_id`, `blacklisted_at`, `expires_at`, `reason`)
- `db/repositories/token_blacklist_repo.py`: `is_blacklisted()`, `add_token()`, `blacklist_user_tokens()`, `remove_expired()`
- Bei **Token-Refresh** (`api/v1/auth.py`): Alter Refresh-Token wird sofort blacklisted → echte Rotation
- Bei **Logout**: Access-Token ebenfalls blacklisted
- Alle Requests prüfen in `api/deps.py:160–166` Blacklist via `blacklist_repo.is_blacklisted(token)`
- WebSocket-Auth (`api/v1/websocket/realtime.py:99–104`) prüft ebenfalls Blacklist

→ Detail-Dokumentation in [E7-auth-security-acl.md](../60-querschnitt-auth/E7-auth-security-acl.md).

---

### D3 — Frontend-Routing

**Datei:** `El Frontend/src/router/index.ts` (435 Zeilen)

**Alle aktiven Routes (24):**

| Name | Path | Guard |
|------|------|-------|
| `login` | `/login` | requiresAuth: false |
| `setup` | `/setup` | requiresAuth: false |
| `hardware` | `/hardware` | requiresAuth: true |
| `hardware-zone` | `/hardware/:zoneId` | requiresAuth: true |
| `hardware-esp` | `/hardware/:zoneId/:espId` | requiresAuth: true |
| `monitor` | `/monitor` | requiresAuth: true |
| `monitor-zone` | `/monitor/:zoneId` | requiresAuth: true |
| `monitor-sensor` | `/monitor/:zoneId/sensor/:sensorId` | requiresAuth: true |
| `monitor-zone-dashboard` | `/monitor/:zoneId/dashboard/:dashboardId` | requiresAuth: true |
| `editor` | `/editor` | requiresAuth: true |
| `editor-dashboard` | `/editor/:dashboardId` | requiresAuth: true |
| `system-monitor` | `/system-monitor` | requiresAdmin: true |
| `users` | `/users` | requiresAdmin: true |
| `system-config` | `/system-config` | requiresAdmin: true |
| `load-test` | `/load-test` | requiresAdmin: true |
| `access-denied` | `/access-denied` | — |
| `plugins` | `/plugins` | requiresAdmin: true |
| `email-postfach` | `/email` | requiresAdmin: true |
| `sensors` | `/sensors` | requiresAuth: true |
| `logic` | `/logic` | requiresAuth: true |
| `logic-rule` | `/logic/:ruleId` | requiresAuth: true |
| `settings` | `/settings` | requiresAuth: true |
| `calibration` | `/calibration` | requiresAdmin: true |
| `not-found` | `/not-found` | — |

**Deprecated Redirects (12):** `dashboard-legacy`, `custom-dashboard`, `devices`, `mock-esp`, `database`, `logs`, `audit`, `mqtt-log`, `maintenance`, `actuators`, `sensor-history` → jeweils auf neue Route.

**Navigation Guard:** `router.beforeEach` prüft `requiresAuth`, `requiresAdmin`, Setup-Status. Lazy-Loading mit Retry-Logik (max. 2 Versuche, 200ms Delay).

→ Detail-Dokumentation in [E4-frontend-schicht.md](../30-frontend/E4-frontend-schicht.md#routing-karte).

---

### D4 — Alembic-Revisions

**Anzahl:** 60 Revisions-Dateien in `El Servador/god_kaiser_server/alembic/versions/`

**Erste Revision:** `001_add_multi_value_sensor_support.py`

**Letzte Revision:** `soft_delete_devices_preserve_sensor_data.py`

**Merge-Revisionen (mind. 4):** Parallele Entwicklungszweige wurden zusammengeführt — deutet auf Feature-Branch-Workflow hin.

→ Detail-Dokumentation in [E6-datenbank-schema.md](../50-querschnitt-db/E6-datenbank-schema.md#migrations-historie).

---

### D5 — Notification-Pipeline

**Zentrale Klasse:** `NotificationRouter` in `src/services/notification_router.py`

**Trigger-Quellen:**
1. `actuator_alert_handler.py:220–256` (MQTT-Alert → NotificationRouter.route())
2. `logic_engine.py` (Regel-Auslösung → Notification)
3. `api/v1/webhooks.py:195` (externer Webhook-Call)
4. `api/v1/notifications.py:531–543` (manuelle REST-Erstellung)

**Pipeline:** DB-Persistierung → User-Preferences → WS-Broadcast (`notification_new`) → Email (abhängig von Severity + Quiet-Hours + Digest) → optional Webhook

**Deduplication:** 60-Sekunden-Fenster per Fingerprint.

→ Detail-Dokumentation in [E3-server-schicht.md](../20-server/E3-server-schicht.md#notification-pipeline).

---

## E — Neu gefundene Inkonsistenzen

### E1 — `temp_sensor_sht31.cpp` ist leere Datei

**Fundort:** `El Trabajante/src/services/sensor/sensor_drivers/temp_sensor_sht31.cpp` (0 Bytes)

> [!INKONSISTENZ] temp_sensor_sht31.cpp existiert als leere Datei — Treiber liegt anderswo
>
> **Beobachtung:** Datei suggeriert einen dedizierten SHT31-Treiber, ist aber leer. Die echte Implementierung liegt in `src/drivers/i2c_sensor_protocol.cpp` und `src/drivers/i2c_bus.cpp`.
> **Korrekte Stelle:** [E2-firmware-schicht.md](../10-firmware/E2-firmware-schicht.md#sensor-treiber)
> **Empfehlung:** Datei entfernen (Dead Code) oder mit Stub-Kommentar füllen der auf i2c_sensor_protocol.cpp verweist. Separates `auftragstyp:analyse-und-impl`-Issue anlegen.
> **Erst-Erkennung:** E0 (2026-04-26)

---

### E2 — WebSocket-Event-Typen massiv veraltet (31 statt 16)

**Fundort:** `El Frontend/src/types/websocket-events.ts`

**Alle 31 Event-Typen:** `sensor_data`, `actuator_status`, `esp_health`, `config_response`, `esp_reconnect_phase`, `device_discovered`, `error_event`, `server_log`, `db_record_changed`, `actuator_command`, `actuator_command_failed`, `config_published`, `config_failed`, `sequence_started`, `sequence_step`, `sequence_completed`, `sequence_error`, `sequence_cancelled`, `device_rediscovered`, `device_approved`, `device_rejected`, `actuator_response`, `actuator_alert`, `zone_assignment`, `subzone_assignment`, `logic_execution`, `system_event`, `sensor_health`, `notification`, `rule_degraded`, `rule_recovered`

> [!INKONSISTENZ] WebSocket-Event-Typen: 16 dokumentiert, 31 real (+15 nicht dokumentiert)
>
> **Beobachtung:** Sequences, Rule-Events (rule_degraded/recovered), sensor_health, server_log, db_record_changed, actuator_command/failed, config_published/failed, device_rediscovered — alle undokumentiert in IST.
> **Korrekte Stelle:** [E4-frontend-schicht.md](../30-frontend/E4-frontend-schicht.md#websocket-events)
> **Empfehlung:** E4 erstellt vollständige Event-Typ-Tabelle mit Server-Handler-Korrespondenz
> **Erst-Erkennung:** E0 (2026-04-26)

---

### E3 — Vue-Komponenten: 148 statt ~97

**Fundort:** `El Frontend/src/components/` (alle `.vue`-Dateien)

> [!INKONSISTENZ] Komponenten-Zahl veraltet: ~97 dokumentiert, 148 real (+51)
>
> **Beobachtung:** Neue Bereiche seit IST-Aufnahme: `rules/`, `logic/`, `calibration/`, `inventory/`, `modals/` — erhebliches Component-Wachstum nicht nachgezogen
> **Korrekte Stelle:** [E4-frontend-schicht.md](../30-frontend/E4-frontend-schicht.md#komponenten-hierarchie)
> **Empfehlung:** E4 dokumentiert alle 148 Komponenten nach Bereich gruppiert
> **Erst-Erkennung:** E0 (2026-04-26)

---

### E4 — MQTT-Handler: 17 aktive statt 13 (kein Stub)

**Fundort:** `El Servador/god_kaiser_server/src/mqtt/handlers/`

> [!INKONSISTENZ] MQTT-Handler-Zahl veraltet: 13 (12+1 Stub) dokumentiert, 17 aktive real (kein Stub)
>
> **Beobachtung:** Seit IST-Aufnahme hinzugekommen: `heartbeat_metrics_handler.py`, `intent_outcome_handler.py`, `intent_outcome_lifecycle_handler.py`, `queue_pressure_handler.py`. `kaiser_handler.py` existiert nicht (weder aktiv noch Stub).
> **Korrekte Stelle:** [E3-server-schicht.md](../20-server/E3-server-schicht.md#mqtt-handler)
> **Empfehlung:** E3 dokumentiert alle 17 Handler mit Topic-Mapping und Status
> **Erst-Erkennung:** E0 (2026-04-26)

---

### E5 — actuator_type-Normalisierung: pump/valve ebenfalls → "digital"

**Fundort:** `El Servador/god_kaiser_server/src/schemas/actuator.py:56–81`

> [!INKONSISTENZ] actuator_type-Normalisierung betrifft auch pump/valve — nicht nur relay
>
> **Beobachtung:** IST-Behauptung I2 beschrieb nur relay→digital. Tatsächlich: relay, pump UND valve → alle normalisiert zu "digital" in actuator_configs. Differenzierung nur via hardware_type-Feld.
> **Korrekte Stelle:** [E3-server-schicht.md](../20-server/E3-server-schicht.md#actuator-normalisierung), [E2-firmware-schicht.md](../10-firmware/E2-firmware-schicht.md#actuator-typen)
> **Empfehlung:** hardware_type als First-Class-Citizen dokumentieren — actuator_type allein ist nicht ausreichend zur Aktor-Typ-Bestimmung
> **Erst-Erkennung:** E0 (2026-04-26)

---

## F — Sprint-Plan (finale Etappen-Übersicht)

Alle Sub-Issues sind angelegt und mit korrekten blockedBy-Relationen verknüpft.

| Etappe | Linear | Zuständig | blockedBy | Status |
|--------|--------|-----------|-----------|--------|
| E0 Reality-Check | [AUT-176](https://linear.app/autoone/issue/AUT-176) | TM | — | **Done** |
| E1 Gesamtüberblick | [AUT-177](https://linear.app/autoone/issue/AUT-177) | TM | E0 | Bereit |
| E2 Firmware-Schicht | [AUT-178](https://linear.app/autoone/issue/AUT-178) | esp32-dev | E1 | Backlog |
| E3 Server-Schicht | [AUT-179](https://linear.app/autoone/issue/AUT-179) | server-dev | E1 | Backlog |
| E4 Frontend-Schicht | [AUT-180](https://linear.app/autoone/issue/AUT-180) | frontend-dev | E1 | Backlog |
| E5 MQTT-Topic-Matrix | [AUT-181](https://linear.app/autoone/issue/AUT-181) | TM/mqtt-dev | E1 | Backlog |
| E6 Datenbank-Schema | [AUT-182](https://linear.app/autoone/issue/AUT-182) | server-dev | E1 | Backlog |
| E7 Auth + ACL | [AUT-183](https://linear.app/autoone/issue/AUT-183) | server-dev | E1 | Backlog |
| E8 Background-Services | [AUT-184](https://linear.app/autoone/issue/AUT-184) | server-dev | E1 | Backlog |
| E9 Observability + Tests | [AUT-185](https://linear.app/autoone/issue/AUT-185) | meta-analyst | E1 | Backlog |
| E10 Löschpfade | [AUT-186](https://linear.app/autoone/issue/AUT-186) | server-dev + frontend-dev | E1 | Backlog |
| E11 Konsolidierung | [AUT-187](https://linear.app/autoone/issue/AUT-187) | TM | E2–E10 | Backlog |

**Nächster Schritt:** [E1 — Architektur-Gesamtüberblick](E1-architektur-gesamtueberblick.md) kann jetzt starten (E0 Done).

---

## G — Zusammenfassung für Nachfolge-Etappen

### Was E2 (Firmware) jetzt weiß
- NVS-Schema: `sen_{i}_i2c` existiert und funktioniert (I1 widerlegt) → dokumentieren ohne Vorbehalt
- SHT31: Treiber in `i2c_sensor_protocol.cpp`, nicht in `temp_sensor_sht31.cpp` (E1)
- clean_session=true: korrekt, hat Auswirkungen auf Config-Push-Garantien (I8)
- actuator_type "relay"/"pump"/"valve" in Firmware (nicht "digital") — I2/E5

### Was E3 (Server) jetzt weiß
- Tabellennamen: user_accounts, cross_esp_logic, esp_heartbeat_logs (I3)
- MQTT-Handler: 17 aktive, kein KaiserHandler (I11/E4)
- Heartbeat-Mismatch: AUT-134 behoben, erkennt alle Abweichungen (I7 widerlegt)
- NotificationRouter und Pipeline jetzt vollständig bekannt (D5)
- actuator_type-Normalisierung: relay/pump/valve → "digital" (I2/E5)

### Was E4 (Frontend) jetzt weiß
- 148 Komponenten (nicht ~97) (E3)
- 31 WebSocket-Event-Typen (nicht 16) (E2)
- --ao-* Prefix existiert nicht (I4)
- sensorId: useSensorId-Composable defensiv, aber CustomDashboardView.vue:124 direkter Split (I13)

### Was E6 (Datenbank) jetzt weiß
- 34+ Tabellen (nicht 31), alle Namen jetzt korrekt bekannt (B1, I3)
- 60 Alembic-Revisions (D4)
- Soft-Delete: nur esp_devices + zones (I6)

### Was E7 (Auth) jetzt weiß
- JWT-Blacklist: DB-basiert in token_blacklist-Tabelle, echte Rotation (D2)
- 22%-Debug-Behauptung: bezieht sich auf Endpoint-Anzahl, nicht Datei-Anzahl (I12)

### Was E8 (Background-Services) jetzt weiß
- MaintenanceService: 8 Jobs mit genauen Triggern (D1)
- SensorSchedulerService (Klassen-Name, nicht SensorScheduler)
- SimulationScheduler unter simulation/scheduler.py
