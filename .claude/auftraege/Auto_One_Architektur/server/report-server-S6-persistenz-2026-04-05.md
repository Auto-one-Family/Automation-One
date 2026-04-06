# Report S6 — Persistenz: Session, Models, Repositories, Alembic

**Datum:** 2026-04-05  
**Codebasis:** `El Servador/god_kaiser_server/`  
**Bezug:** Auftrag `auftrag-server-S6-persistenz-session-models-repos-2026-04-05.md`, Kreuzcheck S5 (MQTT-Writer), S2 (HTTP-Writer, grob)

---

## 1. Session-Fabrik

| Aspekt | Implementierung | Codeanker |
|--------|-----------------|-----------|
| **Paradigma** | Ausschließlich **async** (`AsyncSession`, `create_async_engine`, `asyncpg` / SQLite) | `src/db/session.py` |
| **Engine** | Singleton `_engine`, Pooling nur bei Nicht-SQLite (`pool_pre_ping=True`) | `get_engine()` |
| **Session-Maker** | Lazy `_async_session_maker`: `expire_on_commit=False`, `autocommit=False`, `autoflush=False` | `get_session_maker()` |
| **Standard-Pfad** | `async for session in get_session():` — `yield` in `async with session_maker()`, bei Exception **rollback**, immer **close** | `get_session()` Zeilen 131–151 |
| **HTTP** | FastAPI `Depends(get_db)` wrappt `get_session()` | `src/api/deps.py` `get_db()` |
| **Resilienz-Pfad** | `resilient_session()` / `get_session_with_resilience()`: vor Acquire **Circuit-Breaker-Check**; bei `OperationalError`/`InterfaceError` **record_failure** + rollback; sonstige Exceptions rollback **ohne** CB-Failure; erfolgreicher Exit **record_success** | `session.py` 278–334 |
| **Startup `init_db`** | Optional `Base.metadata.create_all` mit **Retry** (exponentielles Backoff) bei Connect-Fehlern | `init_db()` 154–209 |
| **Shutdown** | `dispose_engine()` | `session.py` 212–223 |

**Hinweis:** Der DB-Circuit-Breaker wird in `main.py` registriert (`init_db_circuit_breaker`); **die meisten MQTT-Handler** nutzen `resilient_session()`. **HTTP** nutzt typischerweise nur `get_session()` / `get_db()` — **kein** automatischer Circuit-Breaker auf dem Request-Pfad.

---

## 2. Models / Tabellen (fachliche Kurzrolle)

| Tabelle | Modell(e) | Rolle |
|---------|-----------|--------|
| `esp_devices` | `ESPDevice` | Geräteregister, Zone, Online-Status, Metadaten, Simulation |
| `sensor_configs` | `SensorConfig` | Sensor-Konfiguration pro ESP |
| `sensor_data` | `SensorData` | Zeitreihe Roh/verarbeitete Messwerte |
| `actuator_configs` | `ActuatorConfig` | Aktor-Konfiguration |
| `actuator_states` | `ActuatorState` | Laufzeitzustand |
| `actuator_history` | `ActuatorHistory` | Befehls-/Ereignishistorie |
| `cross_esp_logic` | `CrossESPLogic` | Regeln Logic Engine |
| `logic_execution_history` | `LogicExecutionHistory` | Regelausführungen |
| `logic_hysteresis_states` | `LogicHysteresisState` | Hysterese-Persistenz |
| `zones` | `Zone` | Zonen-Stammdaten |
| `subzone_configs` | `SubzoneConfig` | Subzonen-Zuordnung, Safe-Mode |
| `device_zone_changes` | `DeviceZoneChange` | Audit Zone-Wechsel |
| `device_active_context` | `DeviceActiveContext` | Aktiver Kontext Sensor/Aktor (Multi-Zone) |
| `zone_contexts` | `ZoneContext` | Fachlicher Zonen-Kontext |
| `command_intents` / `command_outcomes` | `CommandIntent`, `CommandOutcome` | Intent/Outcome-Contract |
| `esp_heartbeat_logs` | `ESPHeartbeatLog` | Heartbeat-Historie |
| `audit_logs` | `AuditLog` | Audit, MQTT-/API-Fehler, Geräteevents |
| `notifications` / `notification_preferences` | `Notification`, `NotificationPreferences` | Benachrichtigungen |
| `email_log` | `EmailLog` | E-Mail-Versandprotokoll |
| `diagnostic_reports` | `DiagnosticReport` | Diagnose-Läufe (API/Service) |
| `plugin_configs` / `plugin_executions` | `PluginConfig`, `PluginExecution` | Plugins |
| `dashboards` | `Dashboard` | Dashboard-Layouts |
| `user_accounts` | `User` | Benutzer |
| `token_blacklist` | `TokenBlacklist` | JWT-Revocation |
| `system_config` | `SystemConfig` | Schlüssel/Wert-Konfiguration |
| `sensor_type_defaults` | `SensorTypeDefaults` | Defaults pro Sensortyp |
| `library_metadata` | `LibraryMetadata` | Bibliotheks-Metadaten (Repo derzeit Stub) |
| `kaiser_registry` / `esp_ownership` | `KaiserRegistry`, `ESPOwnership` | Kaiser-Registry |
| `ai_predictions` | `AIPredictions` | KI-Vorhersagen (optional) |

Quelle `__tablename__`: `src/db/models/*.py`, Export in `src/db/models/__init__.py`.

---

## 3. Repositories — Tabellen & öffentliche Methoden (Kurz)

| Repository | Primäre Tabellen | Wesentliche öffentliche API (Auszug) |
|------------|------------------|----------------------------------------|
| `ESPRepository` | `esp_devices` | `get_by_device_id`, `update_status`, `update_last_seen`, `assign_zone`, Mock-CRUD, `rebuild_simulation_config`, … |
| `SensorRepository` | `sensor_configs`, `sensor_data` | `save_data`, `create`/`update`, Queries, Kalibrierung, Cleanup |
| `ActuatorRepository` | `actuator_configs`, `actuator_states`, `actuator_history` | `update_state`, `log_command`, `reset_states_for_device`, … |
| `CommandContractRepository` | `command_intents`, `command_outcomes` | `upsert_intent`, `upsert_outcome`, `upsert_terminal_event_authority`, … |
| `ESPHeartbeatRepository` | `esp_heartbeat_logs` | `log_heartbeat`, `get_history`, `cleanup_old_entries`, … |
| `SubzoneRepository` | `subzone_configs` | CRUD, Safe-Mode, GPIO-Konflikt, Sync |
| `ZoneRepository` | `zones` | CRUD, Archiv, Soft-Delete, `sync_zone_name_to_devices` |
| `ZoneContextRepository` | `zone_contexts` | `upsert`, `patch`, `archive_cycle`, … |
| `DeviceActiveContextRepository` | `device_active_context` | `get_active_context`, `upsert_context`, `delete_context` |
| `LogicRepository` | `cross_esp_logic`, `logic_execution_history` | Regeln laden, `log_execution`, Counts |
| `AuditLogRepository` | `audit_logs` | `log_*` Varianten, Queries |
| `NotificationRepository` / `NotificationPreferencesRepository` | `notifications`, `notification_preferences` | Dedup, Alerts, Digest, Prefs |
| `EmailLogRepository` | `email_log` | `log_send`, Retries, Stats |
| `UserRepository` | `user_accounts` | Auth, CRUD (erbt generische `BaseRepository`-Methoden) |
| `TokenBlacklistRepository` | `token_blacklist` | `add_token`, `is_blacklisted`, Cleanup |
| `SystemConfigRepository` | `system_config` | `get_by_key`, `set_config`, MQTT-Auth-Blob |
| `SensorTypeDefaultsRepository` | `sensor_type_defaults` | CRUD, `get_effective_config` |
| `DashboardRepository` | `dashboards` | User-/Zonen-Dashboards |
| `KaiserRepository` | `kaiser_registry`, `esp_ownership` | Registry, ESP-Zuweisung |
| `AIRepository` | `ai_predictions` | (falls genutzt) |
| `BaseRepository` | je Modell | `create` (flush+refresh), `get_by_id` (UUID), `update`, `delete`, `count`, `exists` |

**Stub:** `src/db/repositories/library_repo.py` — nur Docstring, **keine** Implementierung (Modell `library_metadata` existiert).

---

## 4. Schreibmatrix (Laufzeit-Writer → Tabelle)

Legende: **I**=Insert, **U**=Update, **Ups**=Upsert, **D**=Delete. Zelle = dominante Operation(en); exakte `commit`-Stellen oft im Handler/Endpoint.

### 4.1 MQTT-Inbound (S5-Handler, `resilient_session` wo angegeben)

```yaml
# Maschinenlesbar (Auszug; vollständig für registrierte Pflicht-Handler)
writers:
  sensor_handler:
    esp_devices: U  # last_seen u.a.
    sensor_configs: R/U
    sensor_data: I  # save_data, abgeleitete VPD etc.
    subzone_configs: R
    file: src/mqtt/handlers/sensor_handler.py
  heartbeat_handler:
    esp_devices: U
    esp_heartbeat_logs: I
    audit_logs: I
    sensor_configs: R  # Reconciliation-Pfade
    actuator_states: U  # Bulk-Offline-Pfad
    actuator_history: I
    file: src/mqtt/handlers/heartbeat_handler.py
  lwt_handler:
    esp_devices: U
    command_outcomes: Ups  # terminal authority
    actuator_states: U
    actuator_history: I
    audit_logs: I
    file: src/mqtt/handlers/lwt_handler.py
  diagnostics_handler:
    esp_devices: U  # device_metadata.diagnostics JSON
    file: src/mqtt/handlers/diagnostics_handler.py
  error_handler:
    esp_devices: R
    audit_logs: I
    file: src/mqtt/handlers/error_handler.py
  config_handler:
    command_outcomes: Ups
    sensor_configs: U
    actuator_configs: U
    esp_devices: R
    audit_logs: I
    file: src/mqtt/handlers/config_handler.py
  discovery_handler:
    esp_devices: I/U
    file: src/mqtt/handlers/discovery_handler.py
  actuator_handler:
    esp_devices: R
    actuator_configs: R
    actuator_states: U
    actuator_history: I
    audit_logs: I
    file: src/mqtt/handlers/actuator_handler.py
  actuator_response_handler:
    command_outcomes: Ups
    esp_devices: R
    actuator_history: I
    audit_logs: I
    file: src/mqtt/handlers/actuator_response_handler.py
  actuator_alert_handler:
    esp_devices: R
    actuator_history: I
    actuator_states: U
    file: src/mqtt/handlers/actuator_alert_handler.py
  zone_ack_handler:
    esp_devices: R/U
    zones: R
    device_zone_changes: I  # je nach Pfad
    file: src/mqtt/handlers/zone_ack_handler.py
  subzone_ack_handler:
    subzone_configs: U  # via SubzoneService.handle_subzone_ack
    file: src/mqtt/handlers/subzone_ack_handler.py
  intent_outcome_handler:
    command_intents: Ups
    command_outcomes: Ups
    audit_logs: I
    file: src/mqtt/handlers/intent_outcome_handler.py
  intent_outcome_lifecycle_handler:
    audit_logs: I
    file: src/mqtt/handlers/intent_outcome_lifecycle_handler.py
```

**Nicht in der YAML-Zeile:** `MockActuatorHandler` (`src/services/simulation/actuator_handler.py`) — primär MQTT publish; DB nur in Hilfspfaden (z. B. Init), kein klassischer Ingest wie Sensor.

### 4.2 HTTP (S2 — Cluster-Ebene, typische Tabellen)

| Router-Bereich (`api/v1/`) | Typische Schreibziele |
|----------------------------|------------------------|
| `auth`, `users` | `user_accounts`, `token_blacklist` |
| `esp` | `esp_devices`, ggf. `sensor_configs`/`actuator_configs` (Mock), `audit_logs` |
| `sensors`, `actuators` | `sensor_configs`/`actuator_configs`, `actuator_states`/`history`, `sensor_data` (je nach Endpoint) |
| `zones`, `zone`, `subzone`, `device_context`, `zone_context` | `zones`, `subzone_configs`, `device_active_context`, `zone_contexts`, `device_zone_changes`, `esp_devices` |
| `logic` | `cross_esp_logic`, ggf. Hysterese |
| `notifications` | `notifications`, `notification_preferences` |
| `audit` (Retention/Export) | `audit_logs` (D/Cleanup) |
| `debug` | breites Spektrum (Tests/Seeding) |
| `diagnostics` | `diagnostic_reports` |
| `plugins` | `plugin_configs`, `plugin_executions` |
| `sensor_type_defaults` | `sensor_type_defaults` |
| `kaiser` | `kaiser_registry`, `esp_ownership` |

Detaillierte „Endpoint → Funktion“-Zuordnung ist **S2-Deliverable**; diese Matrix erfüllt S6-Anforderung auf **Writer-Kategorie**-Ebene mit MQTT-vollständig für S5-Liste.

### 4.3 Background / Services (Auszug)

| Komponente | Tabellen (Schreiben) |
|------------|----------------------|
| `LogicEngine` + Hysterese | `logic_execution_history`, `logic_hysteresis_states`, indirekt Aktoren über Services |
| `MaintenanceService` / Jobs | `sensor_data`, `audit_logs`, Heartbeat-Logs, … (Cleanup) |
| `SimulationScheduler` | `esp_devices`, `sensor_data`, … |
| `PluginService` | `plugin_configs`, `plugin_executions` |
| `NotificationRouter` | `notifications`, ggf. `email_log` |
| `DiagnosticsService` | `diagnostic_reports` |
| `sensor_type_registration` | `sensor_type_defaults` |
| `email_retry_service` | `email_log`, `notifications` |

---

## 5. Transaktionen

- **Grenze:** Explizites `await session.commit()` in Handlern, Services und vielen API-Routen; **BaseRepository.create/update/delete** machen **`flush`**, nicht automatisch `commit`.
- **HTTP:** Eine Request-Session kann mehrere Flushes enthalten; Commit oft **am Ende des Endpoints** (`await db.commit()`).
- **MQTT:** Pro Handler typisch **eine** `resilient_session`-Spanne mit **einem** `commit` am Erfolgsende; bei Teilerfolg teils **kein** Commit (z. B. Subzone ACK nur bei `success`).
- **Flush-Relevanz:** Generische `create()` nutzt `flush`+`refresh` für PK/Defaults vor Rückgabe — nachfolgende Reads in derselben Session sehen den Stand.
- **Race-Szenarien (bekannt/implizit):** parallele MQTT-Nachrichten desselben ESP (Sensor/Heartbeat) ohne Serializable-Isolation → **last-write-wins** auf Zeilenebene; `CommandContractRepository.upsert_terminal_event_authority` adressiert **Finalität** für Outcomes; Zone/Subzone-ACKs interagieren mit **MQTTCommandBridge** (Concurrency auf Anwendungsebene).

---

## 6. DB-down / Störfälle (Caller-Sicht) — **G2 „keine stillen Verluste“**

| Kategorie | Verhalten | Publikation / Ack | G2-Bewertung |
|-----------|-----------|-------------------|--------------|
| **MQTT + `resilient_session`** | `OperationalError`/`InterfaceError`: CB **failure**, rollback, Exception aus Handler → Subscriber fängt, `messages_failed++`, bei kritischen Topics **Inbox** `mark_attempt`, Event bleibt **pending** für Replay | MQTT QoS 1/2 liefert Broker-Retry; **Anwendung** persistiert erst nach erfolgreichem Handler | **Kein stiller DB-Verlust des Roh-MQTT**: kritische Klassen vor Inbox-Drop geschützt; bei Inbox-Voll (**capacity**) kann ältestes Event verworfen werden → **potenzieller stiller Verlust** unter Extremlast (siehe Gap) |
| **MQTT + Circuit OPEN** | `ServiceUnavailableError` vor DB → Handler scheitert wie oben | wie oben | Inbox gleiches Muster; **explizites** Fehlschlagen, kein „True“ ohne Persistenz |
| **MQTT ohne kritische Inbox** | Handler fehlgeschlagen → kein persistierter Replay-Queue-Eintrag | Abhängig von QoS | **Wiederholbar** durch Broker bei QoS≥1, aber **keine** serverseitige durable Queue |
| **HTTP + `get_session`** | DB-Fehler → Exception propagiert → typisch **500**; kein CB | Client sieht Fehler | **Nicht still**; Client muss retry/idempotent sein |
| **Background-Jobs** | Exception/Log; je nach Job erneuter Lauf | — | Einzelfall prüfen (Maintenance ignoriert oft einzelne Deletes) |
| **Audit im Exception-Handler** | `_log_to_audit`: eigene Session; Fehler **debug-logged**, Response **nicht** blockiert | — | **Audit kann still fehlen** — bewusst „non-critical“ |

**Drei Codeanker (Störfall):**

1. Session-Rollback bei beliebigem Fehler im Standard-Generator:

```131:151:El Servador/god_kaiser_server/src/db/session.py
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    ...
    async with session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

2. Circuit-Breaker blockiert DB-Zugriff (`ServiceUnavailableError`):

```302:312:El Servador/god_kaiser_server/src/db/session.py
    if _db_circuit_breaker and not _db_circuit_breaker.allow_request():
        logger.warning("[resilience] Database operation blocked by Circuit Breaker")
        raise ServiceUnavailableError(
            service_name="database",
            reason="Circuit breaker is OPEN",
            ...
        )
```

3. Kritische MQTT-Inbox + Replay (File-JSONL, nicht PostgreSQL):

```28:83:El Servador/god_kaiser_server/src/services/inbound_inbox_service.py
class InboundInboxService:
    """File-backed durable inbox with simple replay/dedup support."""
    ...
    async def append(...):
        ...
        if len(self._events) >= self._capacity:
            ...  # drop oldest acked or oldest pending
            logger.warning(
                "Inbound inbox capacity reached, dropping oldest event ..."
            )
```

---

## 7. Alembic vs. Modelle

- **Soll-Produktion:** Schema über **Alembic** (`alembic/versions/*.py`), nicht über `create_all`.
- **`init_db`:** Nur für Dev/CI; importiert **nicht** alle Model-Submodule — **Risiko unvollständiger `create_all`-Tabellen** gegenüber `models/__init__.py` (z. B. Zonen, Notifications, Plugins fehlen in der Importliste in `init_db`). → **Drift Dev-Auto-Init vs. volles Modell** (Gap P1).
- **Neuere Migrationen:** z. B. `add_esp_heartbeat_runtime_telemetry_jsonb.py` — mit Modell `esp_heartbeat.py` abgleichen bei Deploy.

---

## 8. „Authoritative fields“ (Server als Source of Truth — Kern)

| Entität | Server-autoritativ (kurz) |
|---------|---------------------------|
| `ESPDevice` | Registrierung, `status`, `zone_id`, `last_seen`/`last_heartbeat`, Soft-Delete, Simulationsfelder |
| `SensorConfig` / `ActuatorConfig` | Typ, GPIO, Kalibrierung, Metadaten, Enable-Flags |
| `SensorData` | Persistierte Messreihe (Roh + verarbeitet, Zone/Subzone) |
| `ActuatorState` / `ActuatorHistory` | Soll/Ist und Befehlshistorie (Safety/Logic konsumieren) |
| `CrossESPLogic` + Hysterese | Regeldefinition und Zustand für Auswertung |
| `command_intents` / `command_outcomes` | Intent/Outcome-Finalität (mit Stale-/Authority-Logik) |
| `zones` / `subzone_configs` | Organisatorische Wahrheit für Zuordnung |
| `notifications` | Dedup/Fingerprint, Lifecycle |
| `user_accounts` / `token_blacklist` | Auth-Zustand |

Firmware liefert **Rohwerte** und Events; **Auswertung und Persistenz der Geschäftswahrheit** liegen beim Server (Architekturregel).

---

## 9. Gap-Liste P0 / P1 / P2

| ID | Schwere | Befund |
|----|---------|--------|
| **S6-P1** | P1 | **`init_db`** importiert nur eine **Teilmenge** der Model-Module — `create_all` kann **Tabellen fehlen** im Vergleich zu Alembic/vollständigem `models`-Paket. |
| **S6-P1** | P1 | **Inbound-Inbox** bei **Kapazitätsüberschreitung** verwirft älteste Events (inkl. möglicherweise noch **pending**) → **G2-Risiko** unter Last/Storage. |
| **S6-P2** | P2 | **`library_repo.py`** unimplementiert — Modell existiert, kein Repository-Pattern wie übrige Domäne. |
| **S6-P2** | P2 | **HTTP-Pfad** ohne `resilient_session`: DB-Ausfall = harte Exceptions; **kein** einheitliches CB-Verhalten mit MQTT — dokumentierbar für Betrieb (kein Bug per se). |
| **S6-P2** | P2 | **Audit-Logging** in `exception_handlers._log_to_audit` kann **still scheitern** (by design) — Lücke in der „vollständigen Auditierbarkeit“ bei API-Fehlern. |

---

## 10. Abnahme Kreuzcheck S5 / S2

- **S5 (registrierte Pflicht-Handler):** Alle in der Auftragsliste genannten Handler sind in **Abschnitt 4.1** als Writer erfasst oder explizit als nicht-DB (Mock) benannt.
- **S2:** Schreibende HTTP-Pfade sind in **4.2** clustert; granular pro Route bleibt im **S2-Report** nachzutragen — hier **keine Lücke P1**, sondern **Verweis auf S2** für „jeder Endpoint einzeln“.

---

*Ende Report S6*
