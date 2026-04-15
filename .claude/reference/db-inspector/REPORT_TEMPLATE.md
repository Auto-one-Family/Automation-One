# DB Inspector Report — Template

> Kopiere diese Struktur nach `.claude/reports/current/DB_INSPECTOR_REPORT.md`. Platzhalter in eckigen Klammern ersetzen.

```markdown
# DB Inspector Report

**Erstellt (UTC):** [ISO-8601]  
**Modus:** A (Allgemein) / B ([Kurzsymptom])  
**Eingaben:** device_id=[…] | esp_uuid=[…] | Fenster=[from–to] | request_id=[…]  
**Quellen:** [Tabellen / Alembic / information_schema / Logs nur Pfad]

---

## 1. Zusammenfassung

[2–4 Sätze: Befund, Schwere, ob Migration/Schema verantwortlich]

---

## 2. Migration & Alembic

| Check | Soll | Ist | Evidenz |
|--------|------|-----|---------|
| `alembic heads` (Repo) | *(HEAD aus Repo-Befehl)* | […] | Befehl + Ausgabe (gekürzt) |
| `SELECT version_num FROM alembic_version` | = Head | […] | Query-Ergebnis |
| Kritischer Constraint (Name) | z. B. `uq_sensor_data_esp_gpio_type_timestamp` | vorhanden / fehlt | `pg_constraint` oder `\d sensor_data` |

### 2.1 Model ↔ Tabelle (Kurzverweis)

Relevante Zeilen aus [MODEL_TABLE_MATRIX.md](MODEL_TABLE_MATRIX.md) hier einkopieren oder verlinken (keine vollständige Paralleldoku).

---

## 3. Schema-Stichprobe (read-only)

| Tabelle | Spalte(n) / Constraint | information_schema / psql | Bemerkung |
|---------|------------------------|----------------------------|-----------|
| … | … | OK / Abweichung | … |

---

## 4. Invarianten-Engine (SQL mit LIMIT)

| ID | Check | SQL (gekürzt) | Ergebnis | Schwere |
|----|--------|---------------|----------|----------|
| INV-01 | FK / verwaiste sensor_data | `… LIMIT 50` | Zeilen=0 / >0 | … |
| INV-02 | actuator_states Enum vs. Code | `… LIMIT 50` | … | … |
| INV-03 | Soft-Delete vs. Status | `… LIMIT 50` | … | … |
| INV-04 | Subzone GPIO vs. Configs | `… LIMIT 50` | … | … |
| INV-05 | `esp_devices` Soft-Delete vs. Status | siehe VERTRAG SQL (5) | … | … |
| INV-06 | `subzone_configs.esp_id` ohne `device_id` | siehe VERTRAG SQL (6) | … | … |
| INV-07 | Zonen Soft-Delete / Status | siehe VERTRAG SQL (7) | … | … |
| … | … | … | … | … |

---

## 5. Schichten-Map (pro Befund)

| Befund-ID | DB | Server-Modul | API/WS | Frontend (Store/Feld) |
|-----------|-----|--------------|--------|-------------------------|
| … | … | `path:symbol` | … | … |

---

## 6. Risiken & Annahmen

- [ ] Alle Schema-Aussagen mit Migration oder Modell belegt  
- [ ] Annahmen ohne Repo-Beleg als **UNVERIFIZIERT** markiert  

---

## 7. Nächste Schritte

1. [z. B. server-debug: Handler X + request_id …]  
2. [z. B. Migration PR / `alembic upgrade head` in CI — **nicht** vom Inspector ausführen]  
3. …

---

## 8. Extended Checks (optional)

| Check | Ergebnis |
|--------|----------|
| `pg_isready` | … |
| `GET /api/v1/health/detailed` | … |
| `docker compose logs --tail=N postgres` | nur Pfad/Compose-Service, keine Secrets |
```
