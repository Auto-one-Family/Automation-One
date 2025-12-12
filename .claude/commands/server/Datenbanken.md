## Übersicht
Alle gespeicherten Zustände im Projekt: Server-SQLite, Frontend-LocalStorage, ESP32-NVS. Fokus auf reale Implementierung (Stand: aktueller Code).

## Server (El Servador)
- **Engine/Ort:** SQLite-Datei `god_kaiser_dev.db` im Verzeichnis `El Servador/god_kaiser_server/`. URL aus Settings (`src/core/config.py`, `settings.database.url`), Standard `sqlite:///./god_kaiser_dev.db`.
- **Initialisierung:** `src/main.py` → `init_db()` (auto_init) erstellt Tabellen bei Start. Alembic-Migrationen unter `alembic/`.
- **Zugriffsschicht:** SQLAlchemy ORM
  - Session-Fabrik: `src/db/session.py`
  - Modelle: `src/db/models/` (u.a. `user.py`, `esp.py`, `sensor.py`, `actuator.py`, `logic.py`, `kaiser.py`, `system.py`, `library.py`, `ai.py`)
  - Repositories: `src/db/repositories/` (CRUD/Queries)
- **Wichtige Tabellen (vereinfachter Zweck):**
  - `users`: Credentials, Rollen (`admin|operator|viewer`), Timestamps.
  - `esps`: Geräte-Registry, Status, Metadata.
  - `sensor_configs`, `actuator_configs`: Konfiguration je ESP/GPIO; Flags wie `raw_mode`, `pi_enhanced`, `critical`.
  - `sensor_data`: Messwerte (raw/processed/unit/quality/timestamp).
  - `logic_rules` (+ evtl. `logic_executions`): Automationsregeln, Cooldown, Trigger-Log.
  - `system_configs`, `system_logs`: Systemweite Settings/Logs.
  - `libraries`: Sensor-Library-Metadaten.
  - `kaiser`: Kaiser-Node Infos.
  - Erweiterungen per Migration `alembic/versions/`.
- **Auth-Daten:** Password-Hashes in `users` (Backend `core/security.py`). Tokens werden nicht dauerhaft gespeichert; JWTs werden vom Backend ausgestellt und geprüft.
- **Backups/Utility:** Scripts unter `src/scripts/` (z.B. `backup_db.py`, `restore_db.py`, `create_admin.py`).

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
- Sauber-Start: `god_kaiser_dev.db` löschen (dev-only), Server neu starten → Tabellen werden neu angelegt; danach Setup im Frontend ausführen.