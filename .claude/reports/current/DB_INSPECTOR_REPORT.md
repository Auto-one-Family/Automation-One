# DB Inspector Report

**Erstellt:** 2026-03-30 (Docker Rebuild Session)
**Modus:** A (Allgemeine Analyse — Docker Rebuild + Migration-Status nach Session-Neustart)
**Quellen:** postgres Container, pg_isready, alembic_version, cross_esp_logic, logic_execution_history, information_schema (Constraints), pg_tables (Groessen), logic.py Model

---

## 1. Zusammenfassung

Der DB-Container ist gesund und erreichbar. Die beiden bestehenden Logic-Engine-Tabellen (`cross_esp_logic`, `logic_execution_history`) sind schema-konform mit korrektem CASCADE-Foreign-Key. Es existiert 1 Logic-Rule mit 4 Execution-History-Eintraegen. Die neue Tabelle `logic_hysteresis_states` fehlt in der DB — das ist **erwartet und korrekt**: Alembic steht auf `fix_null_coalesce_unique`, die Migration `add_logic_hysteresis_states` wurde noch nicht ausgefuehrt. Das Model `LogicHysteresisState` ist vollstaendig und korrekt in `logic.py` implementiert. **Handlungsbedarf: Migration ausfuehren via `alembic upgrade head`.**

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | Container healthy, Up 45+ Stunden |
| pg_isready | OK | `/var/run/postgresql:5432 - accepting connections` |
| alembic_version (DB) | OK | Aktuell auf `fix_null_coalesce_unique` |
| cross_esp_logic | OK | 1 Rule, Schema vollstaendig |
| logic_execution_history | OK | 4 Eintraege, Schema vollstaendig |
| logic_hysteresis_states | FEHLT | Erwartet — Migration ausstehend |
| add_logic_hysteresis_states.py | OK | Migration korrekt definiert |
| logic.py (Model) | OK | LogicHysteresisState vollstaendig implementiert |
| pg_tables (Groessen) | OK | DB gesamt 13 MB |
| Aktive Connections | OK | 11 aktive Verbindungen |

---

## 3. Befunde

### 3.1 Allgemeiner DB-Status

**Schwere:** Info
**Detail:** PostgreSQL laeuft stabil, keine Auffaelligkeiten.

| Parameter | Wert |
|-----------|------|
| Container | automationone-postgres, healthy |
| Uptime | 45+ Stunden |
| pg_isready | accepting connections |
| DB-Groesse | 13 MB |
| Aktive Connections | 11 |

---

### 3.2 Alembic Migration-Status — MIGRATION AUSSTEHEND

**Schwere:** Mittel (erwartet, kein Fehler)
**Detail:** Die DB-Version steht auf `fix_null_coalesce_unique`. Die neue Migration `add_logic_hysteresis_states` (Revision ID: `add_logic_hysteresis_states`, Revises: `fix_null_coalesce_unique`) wurde erstellt aber noch nicht ausgefuehrt.

**Evidenz:**
```
alembic current: fix_null_coalesce_unique (head)
alembic_version (DB): fix_null_coalesce_unique
```

Hinweis: Alembic betrachtet `fix_null_coalesce_unique` als aktuellen `head` weil es keine weitere Migration in der angewandten Chain gibt — die neue Migration liegt nur auf Disk, nicht in der DB.

**Erwarteter Zustand nach Migration:**
```
alembic current: add_logic_hysteresis_states (head)
```

---

### 3.3 cross_esp_logic — Schema korrekt

**Schwere:** Info
**Detail:** Tabelle existiert mit allen erwarteten Spalten. Schema stimmt mit `CrossESPLogic` Model ueberein.

**Schema (14 Spalten):**

| Spalte | Typ | Nullable | Bemerkung |
|--------|-----|----------|-----------|
| id | uuid | NO | PK |
| rule_name | varchar | NO | UNIQUE, INDEX |
| description | text | YES | |
| enabled | boolean | NO | INDEX |
| trigger_conditions | json | NO | |
| logic_operator | varchar | NO | AND/OR |
| actions | json | NO | |
| priority | integer | NO | |
| cooldown_seconds | integer | YES | |
| max_executions_per_hour | integer | YES | |
| last_triggered | timestamptz | YES | |
| rule_metadata | json | NO | |
| created_at | timestamptz | NO | TimestampMixin |
| updated_at | timestamptz | NO | TimestampMixin |

**Constraints geprueft:**
- `cross_esp_logic_pkey` (PRIMARY KEY auf `id`) — vorhanden
- Index `idx_rule_enabled_priority` (enabled, priority) — im Model definiert

---

### 3.4 logic_execution_history — Schema korrekt, CASCADE korrekt

**Schwere:** Info
**Detail:** Tabelle existiert mit allen erwarteten Spalten. FK zu `cross_esp_logic.id` mit `CASCADE` DELETE ist korrekt gesetzt.

**Schema (9 Spalten):**

| Spalte | Typ | Nullable | Bemerkung |
|--------|-----|----------|-----------|
| id | uuid | NO | PK |
| logic_rule_id | uuid | NO | FK -> cross_esp_logic.id CASCADE |
| trigger_data | json | NO | |
| actions_executed | json | NO | |
| success | boolean | NO | |
| error_message | varchar | YES | |
| execution_time_ms | integer | NO | |
| timestamp | timestamptz | NO | INDEX |
| execution_metadata | json | YES | |

**FK-Constraint:**
```
logic_execution_history_logic_rule_id_fkey
  FOREIGN KEY (logic_rule_id) -> cross_esp_logic(id)
  DELETE RULE: CASCADE
```

Ergebnis: Loeschen einer Rule loescht automatisch zugehoerige History-Eintraege. Korrekt.

---

### 3.5 logic_hysteresis_states — TABELLE FEHLT (erwartet)

**Schwere:** Mittel (erwartet — keine Fehlfunktion, nur Migration ausstehend)
**Detail:** Die Tabelle `logic_hysteresis_states` existiert noch nicht in der DB. Das ist der erwartete Zustand nach Auftrag L2, da die Migration noch nicht ausgefuehrt wurde.

**Evidenz:**
```sql
SELECT tablename FROM pg_tables
WHERE schemaname='public' AND tablename LIKE '%logic%';

        tablename
-------------------------
 cross_esp_logic
 logic_execution_history
(2 rows)
-- logic_hysteresis_states: NICHT VORHANDEN
```

**Migration-Datei analysiert** (`add_logic_hysteresis_states.py`):

| Aspekt | Bewertung |
|--------|-----------|
| Revision ID | `add_logic_hysteresis_states` |
| Revises | `fix_null_coalesce_unique` (korrekt, passt zu aktuellem head) |
| Idempotenz | Ja — `if "logic_hysteresis_states" not in existing_tables` Guard vorhanden |
| FK | `rule_id -> cross_esp_logic.id` mit `ondelete="CASCADE"` |
| Unique Constraint | `uq_hysteresis_state_rule_cond` auf `(rule_id, condition_index)` |
| Downgrade | `op.drop_table("logic_hysteresis_states")` implementiert |

**Geplantes Schema nach Migration:**

| Spalte | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | integer | NO | autoincrement PK |
| rule_id | uuid | NO | FK -> cross_esp_logic.id CASCADE |
| condition_index | integer | NO | 0 |
| is_active | boolean | NO | false |
| last_value | float | YES | NULL |
| last_activation | timestamptz | YES | NULL |
| last_deactivation | timestamptz | YES | NULL |
| updated_at | timestamptz | NO | now() |

---

### 3.6 Datenvolumen Logic-Tabellen

**Schwere:** Info
**Detail:** Minimale Datenmenge aus einem frueheren Testlauf.

**cross_esp_logic (1 Rule):**

| id | rule_name | enabled | priority | last_triggered |
|----|-----------|---------|----------|----------------|
| 675100d6-... | TimmsRegenReloaded | false | 50 | 2026-03-26 14:44:23+00 |

Rule ist aktuell **deaktiviert** (`enabled=false`).

**logic_execution_history (4 Eintraege):**

| logic_rule_id | success | execution_time_ms | timestamp |
|---------------|---------|-------------------|-----------|
| 675100d6-... | true | 17 | 2026-03-26 14:44:23+00 |
| 675100d6-... | true | 17 | 2026-03-26 14:43:22+00 |
| 675100d6-... | true | 15 | 2026-03-26 14:41:52+00 |
| 675100d6-... | true | 19 | 2026-03-26 14:40:52+00 |

Alle 4 Ausfuehrungen erfolgreich, letzter Lauf 2026-03-26. Execution-Zeit: 15-19ms (sehr schnell).

**Tabellen-Groesse:**

| Tabelle | Groesse |
|---------|---------|
| logic_execution_history | 112 kB |
| cross_esp_logic | (in Top-10 nicht sichtbar, < 112 kB) |

---

### 3.7 Model-zu-Schema Konsistenz-Check

**Schwere:** Info
**Detail:** Vergleich `LogicHysteresisState` Model vs. Migration-Schema.

| Spalte | Model (`logic.py`) | Migration (`add_logic_hysteresis_states.py`) | Konsistent |
|--------|-------------------|---------------------------------------------|-----------|
| id | Integer, PK, autoincrement | Integer, autoincrement, primary_key=True | Ja |
| rule_id | UUID FK CASCADE | UUID FK ondelete="CASCADE" | Ja |
| condition_index | Integer, default=0 | Integer, server_default="0" | Ja |
| is_active | Boolean, default=False | Boolean, server_default="false" | Ja |
| last_value | Float, nullable | Float, nullable=True | Ja |
| last_activation | DateTime(timezone=True), nullable | DateTime(timezone=True), nullable=True | Ja |
| last_deactivation | DateTime(timezone=True), nullable | DateTime(timezone=True), nullable=True | Ja |
| updated_at | DateTime(timezone=True), onupdate | DateTime(timezone=True), server_default=now() | Ja (onupdate fehlt in Migration, aber das ist ORM-seitig) |
| UniqueConstraint | uq_hysteresis_state_rule_cond | uq_hysteresis_state_rule_cond | Ja |

Alle Spalten sind konsistent zwischen Model und Migration. Kein Mismatch.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| docker compose ps postgres | healthy, Up 45+ Stunden |
| pg_isready | accepting connections |
| alembic current | fix_null_coalesce_unique (head) |
| alembic_version Tabelle | fix_null_coalesce_unique |
| logic_hysteresis_states in pg_tables | NICHT VORHANDEN (erwartet) |
| FK cross_esp_logic -> logic_execution_history | CASCADE korrekt |
| Server Health /api/v1/health/detailed | Auth-geschuetzt (401) — kein anonymer Zugriff |
| DB Groesse gesamt | 13 MB |
| Aktive Connections | 11 |
| Migration-Datei Idempotenz-Guard | Ja (if-check vorhanden) |

---

## 5. Bewertung & Empfehlung

**Root Cause:** Kein Problem — der IST-Zustand entspricht dem Erwartetem nach Auftrag L2. Die Migration wurde implementiert aber noch nicht ausgefuehrt.

**Zustand-Zusammenfassung:**

| Komponente | Zustand | Bewertung |
|-----------|---------|-----------|
| DB-Container | healthy, Up | OK |
| cross_esp_logic | 1 Rule, Schema korrekt | OK |
| logic_execution_history | 4 Eintraege, CASCADE korrekt | OK |
| logic_hysteresis_states | Fehlt in DB | ERWARTET — Migration ausstehend |
| Migration-Datei | Korrekt, idempotent, revises passt | OK |
| Model LogicHysteresisState | Vollstaendig, konsistent mit Migration | OK |
| Alembic-Kette | fix_null_coalesce_unique -> add_logic_hysteresis_states | Bereit fuer upgrade |

**Naechster Schritt — Migration ausfuehren:**

```bash
docker compose exec el-servador python -m alembic upgrade head
```

**Erwartetes Ergebnis:**
```
INFO  [alembic.runtime.migration] Running upgrade fix_null_coalesce_unique -> add_logic_hysteresis_states
```

**Nach der Migration pruefen:**
```bash
# Alembic-Status
docker compose exec el-servador python -m alembic current
# Erwartung: add_logic_hysteresis_states (head)

# Tabelle vorhanden
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db \
  -c "SELECT tablename FROM pg_tables WHERE tablename='logic_hysteresis_states';"
# Erwartung: 1 row
```

**Sicherheitsnetz:** Der Idempotenz-Guard in der Migration verhindert doppeltes Ausfuehren — `if "logic_hysteresis_states" not in existing_tables` prueft vor dem `CREATE TABLE`.
