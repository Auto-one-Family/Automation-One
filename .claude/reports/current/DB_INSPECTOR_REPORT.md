# DB Inspector Report

**Erstellt:** 2026-03-11 (Session)
**Modus:** B – Spezifisch: PostgreSQL-Erreichbarkeit + Logic Rule TimmsRegen
**Quellen:** automationone-postgres, cross_esp_logic, logic_execution_history, sensor_data, postgres-exporter Logs

---

## 1. Zusammenfassung

**PostgreSQL:** Die Datenbank ist aktuell erreichbar und funktionsfähig. Der Alert „PostgreSQL nicht erreichbar“ (postgres-exporter pg_up == 0) war **echt** – der postgres-exporter hatte Passwort-Auth-Fehler und zeitweise „connection refused“ während eines Postgres-Neustarts. Die Logic Rule **TimmsRegen** existiert in der DB, ist aktiv und wird korrekt ausgeführt; die Execution History zeigt konsistente Trigger bei Luftfeuchte unter 63 %.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | pg_isready: accepting connections |
| pg_isready | OK | Verbindung möglich |
| postgres-exporter | FEHLER | Password auth failed, zeitweise connection refused |
| cross_esp_logic (TimmsRegen) | OK | Regel vorhanden, enabled=true |
| logic_execution_history | OK | 10+ Einträge für TimmsRegen, alle success |
| sensor_data | OK | SHT31 Humidity fließt (33–92 %RH) |

---

## 3. Befunde

### 3.1 PostgreSQL-Container

- **Schwere:** Niedrig (aktuell behoben)
- **Detail:** Container `automationone-postgres` läuft seit ca. 12 Minuten (healthy). Postgres war offenbar kürzlich neu gestartet.
- **Evidenz:** `docker ps` → `Up 12 minutes (healthy)`, `pg_isready` → accepting connections

### 3.2 postgres-exporter (pg_up == 0) — **BEHOBEN**

- **Schwere:** Hoch (konfigurativ) → **Fix angewendet**
- **Detail:** postgres-exporter meldete `pg_up == 0` wegen:
  1. **Password authentication failed** – DB-Passwort stimmte nicht mit `.env` überein (DB war mit anderem Passwort initialisiert)
  2. **connection refused** während Postgres-Neustart (10:42 UTC)
  3. **no such host "postgres"** – kurzzeitige DNS-Auflösungsprobleme
- **Evidenz:** `docker logs automationone-postgres-exporter --tail 20` (vor Fix)
- **Fix angewendet:** `ALTER USER god_kaiser WITH PASSWORD 'password';` ausgeführt (entspricht `.env`), postgres-exporter neu gestartet. Logs zeigen nun: `Semantic version changed server=postgres:5432 from=0.0.0 to=16.13.0` → Verbindung OK.

### 3.3 Logic Rule TimmsRegen

- **Schwere:** Keine (Regel korrekt)
- **Detail:** Regel in `cross_esp_logic`:
  - `rule_name`: TimmsRegen
  - `enabled`: true
  - **Hysteresis:** activate_below 63 %, deactivate_above 70 % (sht31_humidity, ESP_472204, GPIO 0)
  - **Action:** Aktor ON (ESP_472204, GPIO 27)
  - `last_triggered`: 2026-03-11 10:53:17 UTC
- **Evidenz:** DB-Abfrage bestätigt Regel und Konfiguration.

### 3.4 Execution History & Sensor-Daten

- **Schwere:** Keine
- **Detail:** `logic_execution_history` zeigt 10+ erfolgreiche Ausführungen mit Luftfeuchte-Werten 32–45 % (alle unter 63 % → korrekt aktiviert). `sensor_data` liefert aktuelle Werte (33.8, 34.5, 40.6, 91.9 %RH).
- **Evidenz:** Letzte Trigger: value 34.5, 86.6, 34.7, 37.6, 40.6 %RH; alle `success=true`.

### 3.5 Alert-Text „Luftfeuchte unter 50“

- **Schwere:** Niedrig (Display/Redaktion)
- **Detail:** Die Regel schaltet bei **Luftfeuchte unter 63 %** (activate_below: 63). Der Alert-Text „Luftfeuchte unter 50“ passt nicht exakt zur DB-Konfiguration – möglicherweise vereinfachte Anzeige oder anderer Alert-Quelltext (z. B. Grafana).
- **Empfehlung:** Alert-Template prüfen und ggf. auf „unter 63 %“ oder dynamischen Schwellwert anpassen.

---

## 4. Extended Checks (eigenständig durchgeführt)

| Check | Ergebnis |
|-------|----------|
| pg_isready | OK – accepting connections |
| docker ps postgres | OK – Up 12 min, healthy |
| cross_esp_logic TimmsRegen | OK – Regel vorhanden, enabled |
| logic_execution_history | OK – 10+ Einträge, alle success |
| sensor_data sht31_humidity | OK – Daten fließen |
| esp_devices ESP_472204 | OK – online, last_seen 10:54:48 |
| postgres-exporter logs | FEHLER – password auth failed |

---

## 5. Bewertung & Empfehlung

- **Root Cause pg_up == 0:** DB-Passwort stimmte nicht mit `.env` überein (PostgreSQL wurde mit anderem Passwort initialisiert).
- **Durchgeführte Schritte:**
  1. `ALTER USER god_kaiser WITH PASSWORD 'password';` ausgeführt (Wert aus `.env`).
  2. `docker compose restart postgres-exporter` – Verbindung funktioniert, `pg_up 1`.
- **Offen:** Alert-Text „Luftfeuchte unter 50“ ggf. in Grafana/Notification-Template auf „unter 63 %“ oder dynamisch anpassen.

---

## 6. Referenz-Queries (für spätere Prüfungen)

```sql
-- TimmsRegen Regel
SELECT rule_name, enabled, trigger_conditions::text, last_triggered
FROM cross_esp_logic WHERE rule_name = 'TimmsRegen';

-- Letzte Logic-Executions
SELECT timestamp, trigger_data->>'value' as humidity, success
FROM logic_execution_history
WHERE logic_rule_id = '51343d60-d49c-4496-85b7-ce076e176408'
ORDER BY timestamp DESC LIMIT 5;

-- Aktive DB-Connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'god_kaiser_db';
```
