# DB Inspector Report — Beispiel (synthetisch)

> **Hinweis:** Keine Live-DB-Werte. Demonstriert nur **Struktur**, **Evidence-Zitate** und **Schichten-Map**. Echte Läufe immer nach `.claude/reports/current/DB_INSPECTOR_REPORT.md`.

```markdown
# DB Inspector Report

**Erstellt (UTC):** 2026-04-10T12:00:00Z  
**Modus:** B (Sensor-Dedup-Verdacht nach MQTT-QoS-1-Retransmit)  
**Eingaben:** device_id=ESP_EXAMPLE | Fenster=2026-04-09T00:00:00Z–2026-04-10T00:00:00Z  
**Quellen:** alembic_version, sensor_data, pg_constraint, Code-Pfad sensor_handler → sensor_repo

---

## 1. Zusammenfassung

Migration `add_sensor_data_dedup` ist im Repo vorhanden; Dedup-Constraint-Name **`uq_sensor_data_esp_gpio_type_timestamp`** entspricht SQLAlchemy-Modell und `pg_insert(...).on_conflict_do_nothing(constraint=…)` in `SensorRepository.save_data`. Für die beispielhafte `device_id` wurden in der Stichprobe keine verwaisten `sensor_data`-Zeilen gefunden (**UNVERIFIZIERT** ohne echte DB-Anbindung).

---

## 2. Migration & Alembic

| Check | Soll | Ist (Beispiel) | Evidenz |
|--------|------|----------------|---------|
| Repo-HEAD | `ea85866bc66e` | `ea85866bc66e` | `alembic heads` lokal |
| DB `alembic_version` | = HEAD | *(Platzhalter)* | `SELECT version_num FROM alembic_version LIMIT 1;` |

---

## 3. Schema-Stichprobe

| Objekt | Erwartung | Evidenz (Repo) |
|--------|-----------|----------------|
| `sensor_data` UNIQUE | `uq_sensor_data_esp_gpio_type_timestamp` auf `(esp_id,gpio,sensor_type,timestamp)` | `add_sensor_data_dedup_constraint.py` + `SensorData.__table_args__` |

### 2.1 Model ↔ Tabelle (Kurzverweis)

Z. B. Zeile `SensorData` → `sensor_data` + Dedup-Constraint aus [MODEL_TABLE_MATRIX.md](MODEL_TABLE_MATRIX.md).

---

## 4. Invarianten-Engine

| ID | Check | Ergebnis (Beispiel) |
|----|--------|---------------------|
| INV-01 | `sensor_data.esp_id` ohne `esp_devices.id` | 0 Zeilen (Stichprobe LIMIT 50) |
| INV-02 | `actuator_states.state` illegal | 0 Zeilen |
| INV-03 | Soft-delete `esp_devices.deleted_at` gesetzt | manuell mit `status` abgleichen |

---

## 5. Schichten-Map

| Befund | DB | Server | API/WS | Frontend |
|--------|-----|--------|---------|------------|
| Dedup | `sensor_data` UNIQUE | `sensor_repo.save_data` ON CONFLICT | REST `query_sensor_data` liest Zeilen | WS-Event `sensor_data` nutzt `device_id` (`websocket_utils`) |

---

## 6. Risiken & Annahmen

- Beispiel enthält **keine** echten Messwerte oder Secrets.  
- Zeilenanzahl **UNVERIFIZIERT** ohne `psql` gegen Staging.

---

## 7. Nächste Schritte

1. `server-debug`: Logs um `sensor_handler` + `save_data` mit gleichem Zeitfenster.  
2. `mqtt-debug`: Topic `kaiser/god/esp/{device_id}/sensor/{gpio}/data` und Retransmits prüfen.

---

## 8. Extended Checks (optional)

| Check | Ergebnis (Beispiel) |
|--------|---------------------|
| `pg_isready` auf `automationone-postgres` | OK / FAIL |
| `GET /api/v1/health/detailed` | DB + Circuit Breaker Kurznotiz |
| `docker compose logs --tail=30 postgres` | nur Befundklasse, keine Secrets |
```
