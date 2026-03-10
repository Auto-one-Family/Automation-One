## Übersicht
Alle gespeicherten Zustände im Projekt: Server-SQLite, Frontend-LocalStorage, ESP32-NVS. Fokus auf reale Implementierung (Stand: aktueller Code).

## Server (El Servador)
- **Engine/Ort:** PostgreSQL 16 im Docker-Container `automationone-postgres`. User `god_kaiser`, DB `god_kaiser_db`, Port 5432. URL aus `.env` → `DATABASE_URL` in docker-compose.
- **Initialisierung:** `src/main.py` → `init_db()` (auto_init) erstellt Tabellen bei Start. Alembic-Migrationen unter `alembic/`.
- **Zugriffsschicht:** SQLAlchemy ORM (asyncpg Driver)
  - Session-Fabrik: `src/db/session.py`
  - Modelle: `src/db/models/` (u.a. `user.py`, `esp.py`, `sensor.py`, `actuator.py`, `logic.py`, `kaiser.py`, `system.py`, `library.py`, `ai.py`)
  - Repositories: `src/db/repositories/` (CRUD/Queries)
- **Wichtige Tabellen (31 total, vereinfachter Zweck):**
  - `user_accounts`: Credentials, Rollen (`admin|operator|viewer`), Timestamps.
  - `esp_devices`: Geräte-Registry, Status, device_metadata (JSON).
  - `sensor_configs`, `actuator_configs`: Konfiguration je ESP/GPIO; Flags wie `raw_mode`, `pi_enhanced`, `critical`.
  - `sensor_data`: Messwerte (raw/processed/unit/quality/timestamp).
  - `zones`: Zone-Definitionen (zone_id, zone_name, status).
  - `subzone_configs`: Subzonen pro ESP (GPIO-Gruppen, custom_data).
  - `cross_esp_logic` + `logic_execution_history`: Automationsregeln, Cooldown, Trigger-Log.
  - `system_config`: Systemweite Settings.
  - `library_metadata`: Sensor-Library-Metadaten.
  - `kaiser_registry`: Kaiser-Node Infos.
  - `sensor_type_defaults`: Default-Werte pro Sensortyp (Referenzdaten).
  - Weitere: notifications, audit_logs, dashboards, plugin_configs, plugin_executions, token_blacklist, esp_ownership, email_log, diagnostic_reports, notification_preferences, device_active_context, device_zone_changes, zone_contexts, actuator_states, actuator_history, esp_heartbeat_logs, ai_predictions.
  - Erweiterungen per Migration `alembic/versions/`.
- **Auth-Daten:** Password-Hashes in `user_accounts` (Backend `core/security.py`). Revoked Tokens in `token_blacklist`. JWTs werden vom Backend ausgestellt und geprüft.
- **Backups/Utility:** `scripts/docker/backup.sh`, `scripts/docker/restore.sh` (pg_dump/psql).

## Frontend (El Frontend)
- **Persistenz:** LocalStorage des Browsers.
  - Keys: `el_frontend_access_token`, `el_frontend_refresh_token` (gesetzt in `src/stores/auth.ts`, Funktionen `setTokens()`/`clearAuth()`).
  - Enthält nur JWTs; keine weiteren Datenbanken/IndexedDB implementiert.
- **Zugriff:** Lesen/Schreiben direkt im Auth-Store. Token wird per Axios-Interceptor (`src/api/index.ts`) auf Requests gelegt. Kein weiterer Storage.

## ESP32 / Embedded (El Trabajante)
- **NVS (Non-Volatile Storage):** Geräteinterner Key-Value-Store (siehe `El Trabajante/docs/NVS_KEYS.md` und `src/services/config/storage_manager.*`). Hält WiFi/MQTT/Zone/Sensor/Actuator-Konfigurationen.
- **Zur Laufzeit:** RAM-Modelle (Sensor-/Actuator-Manager) mit aktuellem Zustand; kein externes DB-File.
- **MQTT-Historie:** Nicht persistiert auf Gerät; Debug-Historie wird serverseitig gespeichert/abgerufen über `/debug/mock-esp/*` Endpoints (siehe `El Frontend/Docs/APIs.md`).

## Interaktion & Verantwortlichkeiten
- Server ist die einzige echte relationale DB-Quelle; Frontend speichert nur JWTs; ESP nutzt NVS für Geräteeinstellungen.
- Datenfluss: ESP → MQTT → Server (persistiert) → REST/WebSocket → Frontend (anzeige, keine Persistenz).
- Bei Schema-Änderungen: Alembic-Migrationen erstellen (`alembic revision --autogenerate`, `upgrade head`).
- Sauber-Start: TRUNCATE/DELETE auf relevante Tabellen in FK-Reihenfolge (siehe `db-inspector` Skill), Server neu starten. Backup vorher via `scripts/docker/backup.sh`.