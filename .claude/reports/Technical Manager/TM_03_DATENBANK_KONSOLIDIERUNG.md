# TM-Auftrag 03: Datenbank – Test/Dev/Prod, InfluxDB, Pending State

**Verfasser:** Robin (System-Kontext)  
**Format:** Einzelgespräch mit Technical Manager  
**Ziel:** DB-Strategie prüfen, InfluxDB einordnen, Pending-State für Geräteaktionen klären

---

## 0. Referenzdokumente für TM (Robin mitliefern)

**Diese Dateien zuerst lesen – sie liefern die Grundlage für gezielte Analyse.**

| Priorität | Pfad (relativ zu Projektroot) | Inhalt |
|-----------|-------------------------------|--------|
| 1 | `.claude/skills/db-inspector/SKILL.md` | Schema-Übersicht, `make shell-db`, Migration-Status, Retention, Backup |
| 2 | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | Sektion 1.4: Volumes, `automationone-postgres-data`, Bind-Mounts |
| 3 | `El Servador/god_kaiser_server/src/db/models/` | SQLAlchemy-Modelle – esp_devices, sensor_configs, sensor_data, actuator_configs |
| 4 | `El Servador/god_kaiser_server/src/db/repositories/` | sensor_repo, device_repo – wo DB-Writes passieren |
| 5 | `El Servador/god_kaiser_server/src/core/config.py` | DATABASE_URL, Umgebungswechsel |
| 6 | `El Servador/god_kaiser_server/alembic/versions/` | Migration-History, Schema-Änderungen |

**Abgrenzung:** server-debug bei Handler-Fehlern; db-inspector bei Schema/Queries; mqtt-debug bei MQTT.

---

## 1. Referenzdateien für TM-Session hochladen

| # | Datei | Zweck |
|---|-------|-------|
| 1 | `.claude/skills/db-inspector/SKILL.md` | DB-Inspektion, Schema |
| 2 | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | DB-Volumes, Backup |
| 3 | `El Servador/god_kaiser_server/alembic/` | Migrationen |
| 4 | `El Servador/god_kaiser_server/src/db/models/` | SQLAlchemy-Modelle |
| 5 | `El Servador/god_kaiser_server/src/core/config.py` | DATABASE_URL, env |
| 6 | `docker-compose.test.yml` | SQLite statt PostgreSQL |
| 7 | `docker-compose.ci.yml` | tmpfs PostgreSQL |

---

## 2. IST-Zustand (Fakten)

### 2.1 Test/Dev/Prod

| Umgebung | DB-Typ | URL | Speicher |
|----------|--------|-----|----------|
| **Production** | PostgreSQL | postgresql+asyncpg://... | Named Volume |
| **Development** | PostgreSQL | postgresql+asyncpg://... | Named Volume |
| **Test** | SQLite | sqlite+aiosqlite:///./test_db.sqlite | File |
| **CI** | PostgreSQL | postgresql+asyncpg (tmpfs) | RAM |

### 2.2 InfluxDB

- **Aktuell:** Nicht im Projekt integriert.
- **Kontext:** Zeitreihen-Daten (z.B. Sensordaten) gelten oft als Kandidat für InfluxDB.

### 2.3 Pending State

- **Problem:** Sensor anschließen schlägt fehl – DB zeigt trotzdem an, dass der Sensor angeschlossen ist.
- **Flow:** Frontend → Server → DB; ESP validiert/verarbeitet.
- **Erwartung:** Änderungen erst nach ESP/Server-Bestätigung persistieren.
- **Vorschlag:** Pending-State für Aktionen, die noch von Gerät oder Server validiert werden müssen.

### 2.4 Frontend-Datenbank

- Frontend nutzt REST-API für Daten; DB-Zugriff nur über Server.
- Daten-Konsistenz: DB-Status vs. tatsächlicher Gerätezustand kann abweichen.

---

## 3. Offene Fragen (für TM)

1. **InfluxDB:** Welche Daten sollen nach InfluxDB? Nur Sensordaten (Zeitreihen) oder auch andere Metriken? Wie soll PostgreSQL und InfluxDB zusammenspielen?
2. **Datenbank-Konsolidierung:** Welche Tabellen/Modelle bleiben in PostgreSQL? Welche wandern zu InfluxDB?
3. **Pending State:** Wie soll der Pending-State modelliert werden? Neue Tabellen/Spalten? Transitions (pending → confirmed → rejected)? Oder nur temporärer Status in bestehenden Modellen?
4. **Test vs. Dev vs. Prod:** Ist SQLite für Tests ausreichend? Sollen Dev und Prod dieselbe DB-Struktur nutzen (PostgreSQL)? Welche Unterschiede sind erlaubt?
5. **Sensor-Anschließen:** Welcher genaue Ablauf schlägt fehl (API, MQTT, Handler)? Wo wird die DB zu früh aktualisiert – im Handler, im Service, im Repository?

---

## 4. Bereiche für Detail-Analyse

| Bereich | Dateien | Fokus |
|---------|---------|-------|
| Models | `src/db/models/` | Sensor, Actuator, ESP, Zone |
| Repositories | `src/db/repositories/` | Transaktionen, Updates |
| MQTT-Handler | `src/mqtt/handlers/sensor_handler.py`, `actuator_handler.py` | DB-Writes |
| Migrationen | `alembic/versions/` | Schema-Änderungen |
| Config | `config.py`, `.env.example` | DATABASE_URL |

### 4.1 Wo suchen / Was suchen

| Schicht | Wo suchen | Was suchen |
|---------|-----------|------------|
| **Models** | `El Servador/god_kaiser_server/src/db/models/` | `esp_devices`, `sensor_configs`, `sensor_data`, `status`, `pending_approval` |
| **Repositories** | `src/db/repositories/sensor_repo.py`, `device_repo.py` | `save_data`, `update`, Transaktionen, Commit-Punkte |
| **Handler** | `src/mqtt/handlers/sensor_handler.py` | DB-Write vor/nach WebSocket-Broadcast, Fehlerbehandlung |
| **API** | `src/api/` (esp.py) | `GET /esp/devices` filtert `pending_approval` – wo genau? |
| **Config** | `config.py`, `.env.example` | `DATABASE_URL`, `sqlite` vs `postgresql+asyncpg` |

### 4.2 Agent-Befehle für gezielte Analyse

| Analyse-Ziel | Agent | TM-Befehl (Kern) |
|--------------|-------|------------------|
| Schema, Tabellen, Migration | db-inspector | Prüfe `esp_devices`, `sensor_data`, `sensor_configs` – row counts, foreign keys |
| Wo wird DB zu früh geschrieben? | db-inspector + server-debug | Trace: MQTT-Handler → Repo → DB – welcher Schritt schreibt vor Bestätigung? |
| Pending-State in Modellen | server-dev oder db-inspector | Suche `pending_approval`, `status` in Models und API-Filtern |

---

## 5. Empfohlene Agents & Skills

| Zweck | Agent | Skill |
|-------|-------|-------|
| DB-Schema, Queries | db-inspector | db-inspector |
| Server-Logik | server-dev | server-development |
| Flow-Konsistenz | agent-manager | agent-manager |

---

## 6. Verknüpfung mit anderen Punkten

- **Punkt 2 (Docker):** DB-Volumes, Backup-Restore.
- **Punkt 5 (Frontend):** Konsistenz zwischen UI und DB, Pending-Anzeige.

---

## 7. Randinformationen (Full-Stack-Kontext)

| Kontext | Info |
|---------|------|
| **API-Filter** | `GET /api/v1/esp/devices` schließt `pending_approval` aus (esp.py) – SensorsView nutzt nur `espStore.devices` |
| **Sensor-Daten** | `sensor_data` Tabelle – Zeitreihen; `sensor_repo.save_data()` schreibt nach MQTT-Empfang |
| **Timezone** | PostgreSQL: `TIMESTAMP WITHOUT TIME ZONE` – naive datetime nötig (Fall: offset-naive/aware Mismatch) |
