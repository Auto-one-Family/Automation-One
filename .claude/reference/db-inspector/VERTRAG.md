# db-inspector — Vertrag (Input / Output / Tabus)

> **Eine Seite.** Ergänzt Router (`.claude/CLAUDE.md`) und Skill; **kein** Ersatz für Alembic oder SQLAlchemy-Modelle.

## Rolle

Read-only PostgreSQL-16 (`god_kaiser_db`, UTC), Alembic-Stand, Stichproben gegen `information_schema` / `\d`, reproduzierbare SQL mit **`LIMIT`**. Korrelation zu **MQTT-Handlern**, **REST/WS** und **Frontend-Konventionen** nur mit **Evidence** (Dateipfad + Symbol); sonst **`UNVERIFIZIERT`**.

## Input (minimal nützlich)

| Eingabe | Warum |
|---------|--------|
| `device_id` (String, z. B. `ESP_…`) | Join über `esp_devices.device_id`; Subzonen nutzen dieselbe Semantik (`subzone_configs.esp_id` → FK `esp_devices.device_id`). |
| `esp_uuid` (optional) | Direkter PK-Filter auf `esp_devices.id` / `sensor_data.esp_id`. |
| ISO-Zeitfenster (`from`/`to`, UTC) | `sensor_data`, `actuator_history`, `esp_heartbeat_logs`. |
| `request_id` / Korrelations-ID (optional) | Abgleich mit `server-debug` / Audit, falls in Payload/Logs vorhanden. |
| Symptom in einem Satz | Modus B (fokussierte Checks). |

## Output

1. **Primär:** `.claude/reports/current/DB_INSPECTOR_REPORT.md` gemäß [REPORT_TEMPLATE.md](REPORT_TEMPLATE.md).  
2. Jeder Befund: **Schwere**, **Evidenz** (Query + gekürztes Ergebnis oder Alembic-Rev), **Fix-Ort** (mind. eine Zeile: Handler / Repo / API / WS / Store).

## Report-TOC (Pflichtabschnitte)

Siehe [REPORT_TEMPLATE.md](REPORT_TEMPLATE.md) — Kurz: Migration & Alembic, Model↔Tabellen-Matrix (Verweis), Schema-Stichprobe, Invarianten, Schichten-Map, Risiken, Nächste Schritte.

**Model↔Tabelle (Pflichtverweis im Report):** [MODEL_TABLE_MATRIX.md](MODEL_TABLE_MATRIX.md) — im Lauf die für den Befund relevanten Zeilen nennen, nicht die ganze Matrix duplizieren.

## Tabus (Agent-Workflow)

- **Kein DDL/DML** auf Produktions-DB über Standard-Bash-`psql` ohne ausdrückliche menschliche Freigabe; Default nur **`SELECT`**.  
- **`alembic upgrade/downgrade`** im Agenten-Lauf nicht ausführen (nur `current` / `heads` / `history` lesen).  
- **Keine Secrets:** keine Ausgabe von `JWT_SECRET_KEY`, `POSTGRES_PASSWORD`, Inhalten von `.env`.  
- **Kein Produktcode** ändern (das bleibt `server-dev` / Migration-PR).  
- **Große Tabellen:** immer `LIMIT` + erklärte Stichprobe.

## Invarianten-SQL (Kern, copy-paste)

Details und Varianten: [MQTT_DB_KORRELATION.md](MQTT_DB_KORRELATION.md) und Skill Abschnitt „Invarianten“. Mindestens diese **sieben** Baselines (1–5 Kern, 6–7 Subzone/Zone):

```sql
-- 1) Alembic-Stand (eine Zeile)
SELECT version_num FROM alembic_version LIMIT 5;
```

```sql
-- 2) Dedup-Constraint existiert (Name aus Migration add_sensor_data_dedup)
SELECT conname FROM pg_constraint
WHERE conrelid = 'sensor_data'::regclass AND contype = 'u'
  AND conname = 'uq_sensor_data_esp_gpio_type_timestamp';
```

```sql
-- 3) sensor_data mit esp_id, aber ohne passendes esp_devices.id (aktive Integrität)
SELECT sd.id, sd.esp_id, sd.gpio, sd.sensor_type, sd.timestamp
FROM sensor_data sd
LEFT JOIN esp_devices e ON e.id = sd.esp_id
WHERE sd.esp_id IS NOT NULL AND e.id IS NULL
ORDER BY sd.timestamp DESC
LIMIT 50;
```

```sql
-- 4) actuator_states: Werte außerhalb des in actuator_repo dokumentierten Sets
SELECT id, esp_id, gpio, state, last_command_timestamp
FROM actuator_states
WHERE state NOT IN ('on','off','pwm','unknown','error','emergency_stop')
LIMIT 50;
```

```sql
-- 5) Soft-Delete-Sicht: „gelöscht“ aber noch als online geführt (Heuristik — manuell bewerten)
SELECT device_id, status, deleted_at, last_seen
FROM esp_devices
WHERE deleted_at IS NOT NULL
LIMIT 50;
```

```sql
-- 6) Subzonen: esp_id muss existierendes esp_devices.device_id sein (String-FK)
SELECT sc.id, sc.esp_id, sc.subzone_id, sc.parent_zone_id
FROM subzone_configs sc
LEFT JOIN esp_devices e ON e.device_id = sc.esp_id
WHERE e.device_id IS NULL
LIMIT 50;
```

```sql
-- 7) Zonen Soft-Delete vs. status (Evidence-Felder aus zone.py)
SELECT zone_id, name, status, deleted_at
FROM zones
WHERE deleted_at IS NOT NULL OR status IN ('archived', 'deleted')
ORDER BY updated_at DESC
LIMIT 50;
```

## Orchestrierung (auto-debugger / STEUER)

- **Vor** `server-debug` / `mqtt-debug`, wenn Hypothese „Schema drift“, „Migration fehlt“, „Row fehlt trotz erfolgreichem Handler“: zuerst **db-inspector** (`alembic_version`, UNIQUE, FK-Stichprobe).  
- **Nach** MQTT-/Server-Logs, wenn Topic/Payload bekannt ist: db-inspector prüft **dieselben** Schlüssel in `sensor_data` / `actuator_states` (siehe Korrelationsmatrix).  
- **Parallel** zu `esp32-debug` nur bei klar getrennten Fragestellungen (Serial vs. DB-Zeile); sonst sequentiell: Serial-Beweis → DB-Zeile.

## Kanonische Evidence-Quellen (Schema)

- Modelle: `El Servador/god_kaiser_server/src/db/models/`  
- Repos: `El Servador/god_kaiser_server/src/db/repositories/`  
- Migrationen: `El Servador/god_kaiser_server/alembic/versions/`  
- Übersichtstabellen: [MODEL_TABLE_MATRIX.md](MODEL_TABLE_MATRIX.md)  
- HEAD: **nur** nach `alembic heads` + `alembic_version` als Evidenz festhalten — keine fest eingefrorene Rev-ID in Fließtext ohne Befehlsausgabe.
